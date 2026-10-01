import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { Llm } from "./types";
import { createLiveLlm } from "./live";
import { stubLlm } from "./stub";

type Provider = "openai" | "anthropic" | "stub";
type JsonOptions = { temperature?: number };
type JsonRequest = (system: string, user: string, options: JsonOptions) => Promise<string>;
const MAX_TOKENS = 1_500;

export class LlmFailure extends Error {
  readonly code = "LLM_FAILED";
  constructor(message = "AI 응답을 처리하지 못했습니다. 다시 시도해 주세요.") {
    super(message);
    this.name = "LlmFailure";
  }
}

export function providerName(): Provider {
  const name = process.env.LLM_PROVIDER || "openai";
  if (name !== "openai" && name !== "anthropic" && name !== "stub") {
    throw new LlmFailure("LLM_PROVIDER는 openai, anthropic, stub 중 하나여야 합니다.");
  }
  return name;
}

function openai() {
  if (!process.env.OPENAI_API_KEY) throw new LlmFailure("OPENAI_API_KEY가 설정되지 않았습니다.");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 });
}

function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new LlmFailure("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 1 });
}

const requestJSON: JsonRequest = async (system, user, options) => {
  const provider = providerName();
  try {
    if (provider === "openai") {
      const response = await openai().chat.completions.create({
        model: process.env.LLM_MODEL || "gpt-4.1-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: options.temperature ?? 0.2,
        max_tokens: MAX_TOKENS,
      });
      if (response.choices[0]?.finish_reason === "length") throw new LlmFailure("AI 응답이 길이 제한에 도달했습니다.");
      return response.choices[0]?.message.content ?? "";
    }
    if (provider === "anthropic") {
      const stream = anthropic().messages.stream({
        model: process.env.LLM_MODEL || "claude-sonnet-4-6",
        system: `${system}\n마크다운 없이 JSON 객체만 출력하세요.`,
        messages: [{ role: "user", content: user }],
        temperature: options.temperature ?? 0.2,
        max_tokens: MAX_TOKENS,
      });
      const response = await stream.finalMessage();
      if (response.stop_reason === "max_tokens") throw new LlmFailure("AI 응답이 길이 제한에 도달했습니다.");
      return response.content.filter(block => block.type === "text").map(block => block.text).join("");
    }
    throw new LlmFailure("stub 모드에서는 외부 모델을 호출하지 않습니다.");
  } catch (error) {
    // Do not relay SDK payloads, headers, or possibly sensitive source text.
    if (error instanceof LlmFailure) throw error;
    throw new LlmFailure("AI 제공자 요청에 실패했습니다. 인증·네트워크·모델 설정을 확인해 주세요.");
  }
};

/** Shared validation/retry mechanism; transport injection makes retry tests deterministic. */
export async function completeJSONWith<T>(
  request: JsonRequest, system: string, user: string, schema: z.ZodType<T>, options: JsonOptions = {},
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const instruction = attempt === 0 ? system : `${system}\n이전 응답이 형식 검증에 실패했습니다. 지정된 스키마에 맞는 JSON 객체만 출력하세요. 설명이나 코드 펜스는 넣지 마세요.`;
    const raw = await request(instruction, user, options);
    try {
      return schema.parse(JSON.parse(raw));
    } catch {
      if (attempt === 1) throw new LlmFailure("AI JSON 응답이 두 번 연속 검증에 실패했습니다.");
    }
  }
  throw new LlmFailure();
}

export async function completeJSON<T>(system: string, user: string, schema: z.ZodType<T>, options: JsonOptions = {}): Promise<T> {
  return completeJSONWith(requestJSON, system, user, schema, options);
}

/** Tutor output alone is streamed as text, as specified by P6. */
export async function* streamText(system: string, user: string): AsyncIterable<string> {
  try {
    if (providerName() === "openai") {
      const stream = await openai().chat.completions.create({
        model: process.env.LLM_MODEL || "gpt-4.1-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        stream: true,
      });
      for await (const event of stream) {
        if (event.choices[0]?.finish_reason === "length") throw new LlmFailure("AI 응답이 길이 제한에 도달했습니다.");
        const text = event.choices[0]?.delta.content;
        if (text) yield text;
      }
    } else if (providerName() === "anthropic") {
      const stream = anthropic().messages.stream({
        model: process.env.LLM_MODEL || "claude-sonnet-4-6",
        system, messages: [{ role: "user", content: user }],
        max_tokens: MAX_TOKENS, temperature: 0.3,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
      }
      if ((await stream.finalMessage()).stop_reason === "max_tokens") throw new LlmFailure("AI 응답이 길이 제한에 도달했습니다.");
    } else {
      throw new LlmFailure("stub 모드에서는 외부 모델을 호출하지 않습니다.");
    }
  } catch (error) {
    if (error instanceof LlmFailure) throw error;
    throw new LlmFailure("튜터 응답 스트리밍에 실패했습니다. 다시 시도해 주세요.");
  }
}

// Resolve lazily: builds and stub demos never require real provider credentials.
let live: Llm | undefined;
function implementation(): Llm {
  return providerName() === "stub" ? stubLlm : (live ??= createLiveLlm());
}
export const llm: Llm = {
  generateChapters: input => implementation().generateChapters(input),
  prepareSession: input => implementation().prepareSession(input),
  juniorTurn: input => implementation().juniorTurn(input),
  writeExamAnswer: input => implementation().writeExamAnswer(input),
  gradeExam: input => implementation().gradeExam(input),
  tutorExplain: input => implementation().tutorExplain(input),
};
