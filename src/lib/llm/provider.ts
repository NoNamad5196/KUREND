import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { Llm } from "./types";
import { createLiveLlm } from "./live";
import { stubLlm } from "./stub";
import { loadLocalEnvironment } from "./environment";

loadLocalEnvironment();

type Provider = "openai" | "anthropic" | "stub";
type JsonOptions = { temperature?: number; maxOutputTokens?: number; timeoutMs?: number };
type JsonRequest = (system: string, user: string, options: JsonOptions & { signal?: AbortSignal }) => Promise<string>;
const MAX_TOKENS = 1_500;
const DEFAULT_TIMEOUT_MS = 30_000;

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

/**
 * OpenAI 모델별 생성 파라미터. gpt-5·gpt-6 계열(및 o-시리즈)은 temperature 변경과 max_tokens 를 거부하므로
 * (Only the default (1) value is supported / Use max_completion_tokens) 모델명으로 분기한다.
 */
function openaiGenerationParams(model: string, temperature: number, maxTokens: number): Record<string, number> {
  const legacy = /^(gpt-4|gpt-3|chatgpt-4o)/.test(model);
  return legacy ? { temperature, max_tokens: maxTokens } : { max_completion_tokens: maxTokens };
}

function openai() {
  if (!process.env.OPENAI_API_KEY) throw new LlmFailure("OPENAI_API_KEY가 설정되지 않았습니다.");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: DEFAULT_TIMEOUT_MS, maxRetries: 0 });
}

function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new LlmFailure("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: DEFAULT_TIMEOUT_MS, maxRetries: 0 });
}

function providerFailure(error: unknown): LlmFailure {
  if (error instanceof LlmFailure) return error;
  if (error && typeof error === "object") {
    if ("status" in error && (error.status === 401 || error.status === 403)) {
      return new LlmFailure("AI 제공자 접근이 거부되었습니다. API 키·권한·네트워크 허용 설정을 확인해 주세요.");
    }
    if ("status" in error && error.status === 429) {
      return new LlmFailure("AI 제공자 사용 한도에 도달했습니다. 잔액 또는 요청 한도를 확인해 주세요.");
    }
    if ("name" in error && typeof error.name === "string" && /Timeout|Abort/.test(error.name)) {
      return new LlmFailure("AI 응답 대기 시간을 초과했습니다. 다시 시도해 주세요.");
    }
  }
  return new LlmFailure("AI 제공자 요청에 실패했습니다. 인증·네트워크·모델 설정을 확인해 주세요.");
}

const requestJSON: JsonRequest = async (system, user, options) => {
  const provider = providerName();
  const requestOptions = { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, signal: options.signal };
  try {
    if (provider === "openai") {
      const response = await openai().chat.completions.create({
        model: process.env.LLM_MODEL || "gpt-4.1-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        ...openaiGenerationParams(process.env.LLM_MODEL || "gpt-4.1-mini", options.temperature ?? 0.2, options.maxOutputTokens ?? MAX_TOKENS),
      }, requestOptions);
      if (response.choices[0]?.finish_reason === "length") throw new LlmFailure("AI 응답이 길이 제한에 도달했습니다.");
      return response.choices[0]?.message.content ?? "";
    }
    if (provider === "anthropic") {
      const stream = anthropic().messages.stream({
        model: process.env.LLM_MODEL || "claude-sonnet-4-6",
        system: `${system}\n마크다운 없이 JSON 객체만 출력하세요.`,
        messages: [{ role: "user", content: user }],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxOutputTokens ?? MAX_TOKENS,
      }, requestOptions);
      const response = await stream.finalMessage();
      if (response.stop_reason === "max_tokens") throw new LlmFailure("AI 응답이 길이 제한에 도달했습니다.");
      return response.content.filter(block => block.type === "text").map(block => block.text).join("");
    }
    throw new LlmFailure("stub 모드에서는 외부 모델을 호출하지 않습니다.");
  } catch (error) {
    // Do not relay SDK payloads, headers, or possibly sensitive source text.
    throw providerFailure(error);
  }
};

/** Shared validation/retry mechanism; transport injection makes retry tests deterministic. */
export async function completeJSONWith<T>(
  request: JsonRequest, system: string, user: string, schema: z.ZodType<T>, options: JsonOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_TOKENS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw new LlmFailure("AI 요청 제한 설정이 올바르지 않습니다.");
  }
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LlmFailure("AI 응답 대기 시간을 초과했습니다. 다시 시도해 주세요."));
    }, timeoutMs);
  });
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0 || controller.signal.aborted) throw new LlmFailure("AI 응답 대기 시간을 초과했습니다. 다시 시도해 주세요.");
      const instruction = attempt === 0 ? system : `${system}\n이전 응답이 형식 또는 근거 검증에 실패했습니다. 인용은 입력의 원문과 정확히 일치해야 합니다. 모든 제약을 다시 확인하고 지정된 스키마에 맞는 JSON 객체만 출력하세요. 설명이나 코드 펜스는 넣지 마세요.`;
      const raw = await request(instruction, user, {
        ...options, maxOutputTokens: Math.min(MAX_TOKENS, maxOutputTokens),
        timeoutMs: remainingMs, signal: controller.signal,
      });
      try {
        return schema.parse(JSON.parse(raw));
      } catch {
        if (attempt === 1) throw new LlmFailure("AI JSON 응답이 두 번 연속 검증에 실패했습니다.");
      }
    }
    throw new LlmFailure();
  };
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function completeJSON<T>(system: string, user: string, schema: z.ZodType<T>, options: JsonOptions = {}): Promise<T> {
  return completeJSONWith(requestJSON, system, user, schema, options);
}

/** Low-level text streaming; the tutor uses validated JSON before emitting its public events. */
export async function* streamText(system: string, user: string): AsyncIterable<string> {
  try {
    if (providerName() === "openai") {
      const stream = await openai().chat.completions.create({
        model: process.env.LLM_MODEL || "gpt-4.1-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        ...openaiGenerationParams(process.env.LLM_MODEL || "gpt-4.1-mini", 0.3, MAX_TOKENS),
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
  generateTeacherNote: input => implementation().generateTeacherNote(input),
  prepareSession: input => implementation().prepareSession(input),
  juniorTurn: input => implementation().juniorTurn(input),
  writeExamAnswer: input => implementation().writeExamAnswer(input),
  gradeExam: input => implementation().gradeExam(input),
  tutorExplain: input => implementation().tutorExplain(input),
};
