import { z } from "zod";
import type { completeJSON, streamText } from "./provider";
import type { Llm } from "./types";
import { compactChapter } from "./text";
import { TUTOR_EXPLAIN_PROMPT } from "./prompts/tutor-explain";

type TutorCalls = { completeJSON: typeof completeJSON; streamText: typeof streamText };
const REMEMBER = "이것만 기억하면 됩니다:";

// Sentence boundaries are controlled here, before any unvalidated text reaches SSE.
// A decimal point is allowed within a number; a second sentence or list is not.
const sentence = z.string().trim().min(1).max(320)
  .transform((text) => text.replace(/[.!?。！？]$/, ""))
  .refine((text) => text.length > 0 && !/[\r\n!?。！？…]|(?<!\d)\.|\.(?!\d)/u.test(text), "한 문장만 작성하세요")
  .refine((text) => !/^[-*#>\d]+\s/u.test(text) && !text.includes(REMEMBER), "제목, 목록, 기억 문구를 넣지 마세요");

function tutorSchema(chapterText: string, visibleSources: string[]) {
  const fact = z.object({
    text: sentence,
    sourceQuote: z.string().trim().min(1).refine(
      (quote) => chapterText.includes(quote) && visibleSources.some((source) => source.includes(quote)),
      "자료의 정확한 인용이 필요합니다",
    ),
  });
  return z.object({
    opening: sentence,
    explanation: fact,
    clarification: fact,
    analogy: sentence,
    takeaway: sentence,
  }).superRefine((value, ctx) => {
    for (const [path, text] of [
      ["opening", value.opening], ["explanation", value.explanation.text],
      ["clarification", value.clarification.text], ["takeaway", value.takeaway],
    ]) {
      if (/비유|예를\s*들|마치\s|빗대|처럼/u.test(text)) {
        ctx.addIssue({ code: "custom", path: [path], message: "비유는 analogy 필드에만 한 번 쓰세요" });
      }
    }
  });
}

/** Validate once (with the provider's single repair retry), then publish five sentences. */
export function createTutorExplain(calls: TutorCalls): Llm["tutorExplain"] {
  return async function* ({ chapter, gap, request }) {
    if (!chapter.text.trim()) throw new Error("튜터 설명의 근거가 되는 자료가 없습니다.");
    const boundedChapter = compactChapter(chapter);
    // A stale or unrelated gap excerpt must not become an independent source of truth.
    const sourceExcerpt = gap.sourceExcerpt.trim();
    const verifiedExcerpt = sourceExcerpt && chapter.text.includes(sourceExcerpt) ? sourceExcerpt : "";
    const response = await calls.completeJSON(TUTOR_EXPLAIN_PROMPT, JSON.stringify({
      chapter: boundedChapter,
      gap: { title: gap.title, diagnosis: gap.diagnosis, sourceExcerpt: verifiedExcerpt },
      request,
    }), tutorSchema(chapter.text, [boundedChapter.text, verifiedExcerpt]), { temperature: 0.2 });
    const text = [
      response.opening,
      response.explanation.text,
      response.clarification.text,
      `쉬운 비유로, ${response.analogy}`,
      `${REMEMBER} ${response.takeaway}`,
    ].map((part) => `${part}.`).join(" ");
    // Preserve the public token/final contract, including Unicode code points.
    // Buffering avoids leaking a malformed first attempt before its repair succeeds.
    for (const token of text) yield { type: "token", token };
    yield { type: "final", response: text };
  };
}
