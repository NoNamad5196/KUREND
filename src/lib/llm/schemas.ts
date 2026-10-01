import { z } from "zod";
import type { SourceParagraph } from "./text";
import { UNLEARNED_ANSWER } from "./text";

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

export const prepareSessionSchema = z.object({
  objectives: z.array(z.object({ id: z.enum(["o1", "o2", "o3"]), text: nonempty.max(200) })).length(3),
  questions: z.array(z.object({
    qid: z.enum(["q1", "q2", "q3"]), order: z.number().int().min(1).max(3),
    points: z.number().int(), question: nonempty.max(500),
    objectiveRef: z.enum(["o1", "o2", "o3"]),
    rubric: nonempty.refine((value) => {
      const items = value.split(";").filter((item) => item.trim());
      return items.length >= 2 && items.length <= 3;
    }, "채점 기준은 세미콜론으로 구분한 2~3개 요소여야 합니다."),
  })).length(3),
  firstQuestion: nonempty.max(200),
}).superRefine((result, ctx) => {
  result.objectives.forEach((objective, index) => {
    if (objective.id !== `o${index + 1}`) ctx.addIssue({ code: "custom", path: ["objectives", index, "id"], message: "목표 ID는 순서대로 o1, o2, o3입니다." });
  });
  result.questions.forEach((question, index) => {
    if (question.qid !== `q${index + 1}` || question.order !== index + 1 || question.objectiveRef !== `o${index + 1}` || question.points !== (index === 0 ? 34 : 33)) {
      ctx.addIssue({ code: "custom", path: ["questions", index], message: "문항은 q1~q3, 순서 1~3, 목표 o1~o3, 배점 34/33/33이어야 합니다." });
    }
  });
});

export function analyzeTurnSchema(explanation: string, objectiveIds: string[]) {
  return z.object({
    heardConcepts: z.array(nonempty.max(80)).max(30),
    contradictions: z.array(z.object({
      claim: nonempty.refine((claim) => explanation.includes(claim), "사용자 설명을 그대로 인용해야 합니다."),
      why: nonempty.max(500),
    })).max(10),
    coveredObjectives: z.array(nonempty.refine((id) => objectiveIds.includes(id), "존재하는 목표 ID만 사용하세요.")).max(objectiveIds.length),
  });
}

export const respondTurnSchema = z.object({
  reactions: z.array(nonempty.max(40)).min(1).max(3),
  question: nonempty.max(200),
});

export function doubtSchema(allowedDoubt: string) {
  return z.object({ doubt: z.literal(allowedDoubt) });
}

export function examAnswerSchema(refs: number[]) {
  return z.object({
    thought: nonempty.max(30),
    sentences: z.array(z.object({
      text: nonempty.max(1_000), ref: z.number().int().positive().nullable(),
      level: z.enum(["STRONG", "FAINT", "NONE"]),
    })).min(1).max(4),
    unlearned: z.boolean(),
  }).superRefine((result, ctx) => {
    if (result.unlearned) {
      if (result.sentences.length !== 1 || result.sentences[0].text !== UNLEARNED_ANSWER || result.sentences[0].ref !== null || result.sentences[0].level !== "NONE") {
        ctx.addIssue({ code: "custom", path: ["sentences"], message: `못 배웠으면 ref:null, level:NONE인 문장 하나만 쓰세요: ${UNLEARNED_ANSWER}` });
      }
    } else {
      for (const [index, sentence] of result.sentences.entries()) {
        if (sentence.ref === null || !refs.includes(sentence.ref) || sentence.level === "NONE") {
          ctx.addIssue({ code: "custom", path: ["sentences", index], message: "배운 문장은 실제 사용자 설명 ref와 STRONG 또는 FAINT 근거가 있어야 합니다." });
        }
      }
    }
  });
}

const gapSchema = z.object({
  title: nonempty.max(25), diagnosis: nonempty.max(1_000), evidenceQuote: z.string().max(2_000),
  concepts: z.array(nonempty.max(80)).min(1).max(10), sourceExcerpt: nonempty.max(2_000),
});

export function gradeExamSchema(input: {
  qid: string; rubricCount: number; chapterText: string; taught: { content: string }[];
}) {
  return z.object({
    qid: z.literal(input.qid), score: z.number().finite(), verdict: gradeVerdict,
    comment: nonempty.max(120), rubricChecks: z.array(z.boolean()).length(input.rubricCount),
    contradictsSource: z.boolean(), gap: gapSchema.nullable(),
  }).superRefine((result, ctx) => {
    const correct = !result.contradictsSource && result.rubricChecks.every(Boolean);
    if (!correct && !result.gap) ctx.addIssue({ code: "custom", path: ["gap"], message: "정답이 아니면 놓친 곳 진단이 필요합니다." });
    if (result.gap) {
      if (!input.chapterText.includes(result.gap.sourceExcerpt)) ctx.addIssue({ code: "custom", path: ["gap", "sourceExcerpt"], message: "자료 본문의 연속된 문장을 그대로 인용하세요." });
      if (result.gap.evidenceQuote && !input.taught.some((message) => message.content.includes(result.gap!.evidenceQuote))) {
        ctx.addIssue({ code: "custom", path: ["gap", "evidenceQuote"], message: "사용자 설명 원문을 그대로 인용하거나, 없으면 빈 문자열로 두세요." });
      }
    }
  });
}
