import { z } from "zod";
import { LearningErrorReasonSchema } from "@/contracts/types";
import { META_CHOICE } from "./teaching-choices";
import { objectiveRefFor, pointsPlan } from "@/contracts/game";
import type { SourceParagraph } from "./text";
import { isUnlearnedAnswer } from "./text";
import type { TaughtMsg } from "./types";
import { formatExamQuestion, isFormalExamQuestion } from "@/lib/shared/exam-format";
import { stripMarkdownBold } from "@/lib/shared/plain-text";

const nonempty = z.string().trim().min(1);
const gradeVerdict = z.enum(["CORRECT", "PARTIAL", "WRONG"]);

export function chaptersSchema(paragraphs: SourceParagraph[], minChapters: number) {
  return z.object({
    title: nonempty.max(20),
    chapters: z.array(z.object({
      title: nonempty.max(20),
      points: z.array(nonempty.max(15)).min(2).max(4),
      startPara: z.number().int().nonnegative(),
      endPara: z.number().int().nonnegative(),
    })).min(minChapters).max(12),
  }).superRefine((result, ctx) => {
    let next = 0;
    for (const [index, chapter] of result.chapters.entries()) {
      const start = paragraphs[chapter.startPara];
      const end = paragraphs[chapter.endPara];
      if (chapter.startPara !== next || !start || !end || chapter.endPara < chapter.startPara) {
        ctx.addIssue({ code: "custom", path: ["chapters", index], message: "문단 범위는 빈틈이나 겹침 없이 원문 순서로 이어져야 합니다." });
      } else if (start.sourceId !== end.sourceId) {
        ctx.addIssue({ code: "custom", path: ["chapters", index], message: "하나의 목차는 서로 다른 자료를 가로지를 수 없습니다." });
      } else if (end.endOffset - start.startOffset > 4_000) {
        ctx.addIssue({ code: "custom", path: ["chapters", index], message: "목차 본문은 4,000자 이하여야 합니다." });
      } else if (end.endOffset - start.startOffset < 300) {
        ctx.addIssue({ code: "custom", path: ["chapters", index], message: "목차 본문은 300자 이상이어야 합니다." });
      }
      next = chapter.endPara + 1;
    }
    if (next !== paragraphs.length) ctx.addIssue({ code: "custom", path: ["chapters"], message: "제공된 마지막 문단까지 모두 포함해야 합니다." });
  });
}

/**
 * Each question evaluates one distinct learning objective; old 3-item fixtures remain valid.
 */
export function prepareSessionSchemaFor(count = 3, objectiveIndexes?: number[], chapterText?: string) {
  const plan = pointsPlan(count);
  return z.object({
    objectives: z.array(z.object({ id: nonempty, text: nonempty.max(200).transform((value) => stripMarkdownBold(value)), sourceQuote: nonempty.max(1_000).optional() })).length(count),
    questions: z.array(z.object({
      qid: z.string().regex(/^q([1-9]|1[0-9]|20)$/u), order: z.number().int().min(1).max(count),
      points: z.number().int(), question: nonempty.max(500).transform(formatExamQuestion).refine(isFormalExamQuestion, "문제는 호칭과 대화체 없는 정식 시험 문장으로 작성하세요."),
      objectiveRef: nonempty,
      rubric: nonempty.refine((value) => {
        const items = value.split(";").filter((item) => item.trim());
        return items.length >= 2 && items.length <= 3;
      }, "채점 기준은 세미콜론으로 구분한 2~3개 요소여야 합니다."),
      choices: z.array(nonempty.max(200).transform((value) => stripMarkdownBold(value)).pipe(nonempty)
        .refine((value) => !META_CHOICE.test(value), "같은 개념의 구체적인 보기를 쓰세요. 메타 부정이나 모르겠다는 보기는 금지합니다."))
        .length(4).refine((items) => new Set(items.map((item) => item.replace(/^[①②③④]\s*/u, "").replace(/[\s.!?]/gu, ""))).size === 4, "보기는 서로 다른 4개여야 합니다.")
        .refine((items) => { const lengths = items.map((item) => item.replace(/^[①②③④]\s*/u, "").length); return Math.max(...lengths) <= Math.max(8, Math.min(...lengths)) * 2; }, "보기의 길이와 구체성을 비슷하게 맞추세요.").optional(),
    })).length(count),
    firstQuestion: z.string().max(200).default(""),
  }).superRefine((result, ctx) => {
    result.objectives.forEach((objective, index) => {
      if (objective.id !== `o${index + 1}`) ctx.addIssue({ code: "custom", path: ["objectives", index, "id"], message: `목표 ID는 순서대로 o1~o${count}입니다.` });
      if (chapterText !== undefined && (!objective.sourceQuote || !chapterText.includes(objective.sourceQuote))) {
        ctx.addIssue({ code: "custom", path: ["objectives", index, "sourceQuote"], message: "각 핵심 개념을 설명하는 자료의 연속된 원문을 인용하세요." });
      }
    });
    const concepts = result.objectives.map(({ text }) => text.replace(/(?:을|를)?\s*설명할 수 있다[.!?]?$/u, "").replace(/\s+/gu, "").toLocaleLowerCase());
    if (new Set(concepts).size !== count) ctx.addIssue({ code: "custom", path: ["objectives"], message: "서로 다른 핵심 개념을 선정하고 같은 개념을 중복하지 마세요." });
    const questions = result.questions.map(({ question }) => question.replace(/^\d+[.)]\s*/u, "").replace(/\s+/gu, ""));
    if (new Set(questions).size !== count) ctx.addIssue({ code: "custom", path: ["questions"], message: "각 학습 개념에 맞는 서로 다른 시험 문제를 출제하세요." });
    result.questions.forEach((question, index) => {
      if (question.qid !== `q${index + 1}` || question.order !== index + 1 || question.objectiveRef !== objectiveRefFor(index) || question.points !== plan[index]) {
        ctx.addIssue({ code: "custom", path: ["questions", index], message: `문항은 q1~q${count}, 순서 1~${count}, 각 목표 o1~o${count}에 일대일 대응하고 배점은 ${plan.join("/")}이어야 합니다.` });
      }
      if (!objectiveIndexes) return; // 형식 미지정(기존 호환): 보기는 선택
      const mustChoose = objectiveIndexes.includes(index);
      if (mustChoose && !question.choices) ctx.addIssue({ code: "custom", path: ["questions", index, "choices"], message: `${index + 1}번은 객관식(보기 4개)이어야 합니다.` });
      if (!mustChoose && question.choices) ctx.addIssue({ code: "custom", path: ["questions", index, "choices"], message: `${index + 1}번은 서술형이어야 합니다(보기 없음).` });
    });
  });
}
/** 기존 호출 호환: 3문항, 보기 유무는 검사하지 않음 */
export const prepareSessionSchema = prepareSessionSchemaFor(3);

export const teacherNoteSchema = z.object({
  mustTeach: z.array(nonempty.max(200)).min(2).max(8),
  keyTakeaways: z.array(nonempty.max(300)).min(2).max(8),
  confusing: z.array(nonempty.max(300)).min(1).max(6),
  likelyQuestions: z.array(nonempty.max(200)).min(1).max(6),
});

export function analyzeTurnSchema(explanation: string, objectiveIds: string[], taught: TaughtMsg[]) {
  const citation = z.object({ ref: z.number().int().positive(), quote: nonempty.max(600) })
    .refine(({ ref, quote }) => taught.some((message) => message.ref === ref && message.content.includes(quote)),
      "실제 사용자 설명의 ref와 그 설명에 있는 연속된 원문을 인용하세요.");
  return z.object({
    concepts: z.array(z.object({
      name: nonempty.max(80),
      quote: nonempty.max(300).refine((quote) => explanation.includes(quote), "이번 설명의 근거를 그대로 인용하세요."),
    })).max(10),
    contradictions: z.array(z.object({
      claim: nonempty.refine((claim) => explanation.includes(claim), "사용자 설명을 그대로 인용해야 합니다."),
    })).max(3),
    coverage: z.array(z.object({
      id: nonempty.refine((id) => objectiveIds.includes(id), "존재하는 목표 ID만 사용하세요."),
      evidence: z.array(citation).min(1).max(3),
    })).max(objectiveIds.length),
    // 반응 인용은 부가 정보라 형식이 어긋나면 재시도 대신 비운다(빈 문자열이면 템플릿 반응).
    reactionQuote: z.string().transform((quote) => (quote.length <= 26 && explanation.includes(quote) ? quote : "")),
  });
}

export const respondTurnSchema = z.object({
  reactions: z.array(nonempty.max(40)).min(1).max(3),
  question: nonempty.max(200),
});

export function doubtSchema(allowedDoubt: string) {
  return z.object({ doubt: z.literal(allowedDoubt) });
}

export function examAnswerSchema(taught: TaughtMsg[], choices?: string[]) {
  return z.object({
    thought: nonempty.max(30),
    // "③", "3", "(3)", "③ 보기 문장" 처럼 와도 번호 하나로 정규화한다.
    choice: z.preprocess((value) => {
      if (typeof value === "number") value = String(value);
      if (typeof value !== "string") return value;
      const text = value.trim();
      const mark = text.match(/[①②③④]/u)?.[0];
      if (mark) return mark;
      const digit = text.match(/[1-4]/u)?.[0];
      return digit ? "①②③④"[Number(digit) - 1] : text;
    }, z.enum(["①", "②", "③", "④"])).optional(),
    sentences: z.array(z.object({
      quote: nonempty.max(1_000).nullable(), ref: z.number().int().positive().nullable(),
      level: z.enum(["STRONG", "FAINT", "NONE"]),
    })).min(1).max(4),
    unlearned: z.boolean(),
  }).superRefine((result, ctx) => {
    if (choices?.length === 4 && !choices.some((choice) => choice.startsWith(result.choice ?? "\u0000"))) {
      ctx.addIssue({ code: "custom", path: ["choice"], message: "제공된 보기 중 하나를 선택하세요." });
    }
    if (result.unlearned) {
      if (result.sentences.length !== 1 || result.sentences[0].quote !== null || result.sentences[0].ref !== null || result.sentences[0].level !== "NONE") {
        ctx.addIssue({ code: "custom", path: ["sentences"], message: "못 배웠으면 quote:null, ref:null, level:NONE인 항목 하나만 쓰세요." });
      }
    } else {
      for (const [index, sentence] of result.sentences.entries()) {
        if (sentence.quote === null || sentence.ref === null || sentence.level === "NONE"
          || !taught.some((message) => message.ref === sentence.ref && message.content.includes(sentence.quote!))) {
          ctx.addIssue({ code: "custom", path: ["sentences", index], message: "실제 ref의 사용자 설명에 존재하는 연속된 quote와 STRONG 또는 FAINT 근거가 있어야 합니다." });
        }
      }
    }
  });
}

const gapSchema = z.object({
  errorReason: LearningErrorReasonSchema.optional(),
  title: nonempty.max(25), diagnosis: nonempty.max(1_000), evidenceQuote: z.string().max(2_000),
  concepts: z.array(nonempty.max(80)).min(1).max(10), sourceExcerpt: nonempty.max(2_000),
});

export function objectiveGapSchema(chapterText: string, taught: TaughtMsg[]) {
  return z.object({ gap: gapSchema }).superRefine(({ gap }, ctx) => {
    if (!chapterText.includes(gap.sourceExcerpt)) ctx.addIssue({ code: "custom", path: ["gap", "sourceExcerpt"], message: "자료 원문 인용이 필요합니다." });
    if (gap.evidenceQuote && !taught.some((message) => message.content.includes(gap.evidenceQuote)))
      ctx.addIssue({ code: "custom", path: ["gap", "evidenceQuote"], message: "사용자 설명 원문 인용이 필요합니다." });
  });
}

export function gradeExamSchema(input: {
  qid: string; rubricCount: number; chapterText: string; taught: { content: string }[]; answer: string; unlearned?: boolean;
}) {
  return z.object({
    qid: z.literal(input.qid), score: z.number().finite(), verdict: gradeVerdict,
    comment: nonempty.max(120), rubricChecks: z.array(z.boolean()).length(input.rubricCount),
    contradictsSource: z.boolean(), gap: gapSchema.nullable(),
  }).superRefine((result, ctx) => {
    if ((input.unlearned || isUnlearnedAnswer(input.answer)) && (result.rubricChecks.some(Boolean) || result.contradictsSource)) {
      ctx.addIssue({ code: "custom", path: ["rubricChecks"], message: "미학습 응답은 충족한 요소가 없으며 자료와 모순된 주장도 아닙니다." });
    }
    const correct = !result.contradictsSource && result.rubricChecks.every(Boolean);
    if (!correct && !result.gap) ctx.addIssue({ code: "custom", path: ["gap"], message: "정답이 아니면 놓친 곳 진단이 필요합니다." });
    if (correct && result.gap) ctx.addIssue({ code: "custom", path: ["gap"], message: "모든 요소를 충족한 정답에는 놓친 곳 진단이 없어야 합니다." });
    if (result.gap) {
      if (!input.chapterText.includes(result.gap.sourceExcerpt)) ctx.addIssue({ code: "custom", path: ["gap", "sourceExcerpt"], message: "자료 본문의 연속된 문장을 그대로 인용하세요." });
      if (result.gap.evidenceQuote && !input.taught.some((message) => message.content.includes(result.gap!.evidenceQuote))) {
        ctx.addIssue({ code: "custom", path: ["gap", "evidenceQuote"], message: "사용자 설명 원문을 그대로 인용하거나, 없으면 빈 문자열로 두세요." });
      }
    }
  });
}
