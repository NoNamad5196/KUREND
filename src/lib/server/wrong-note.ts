/**
 * [① 게임 코어 P1] 오답노트. AI 진단은 이미 저장된 Gap(diagnosis·evidenceQuote·sourceExcerpt·concepts)에서 즉시 만든다.
 * aiComparison(사용자 이유 vs 실제 원인)은 ② llm.diagnoseWrongNote 가 있으면 그것으로, 없으면 템플릿으로 만든다.
 */
import type { WrongNoteDto } from "@/contracts/game";
import { llm } from "@/lib/llm";
import { db, Prisma } from "@/lib/server/db";
import { parseStringArray } from "@/lib/server/json-fields";
import { parseChoices } from "@/lib/server/session-dto";

export const wrongNoteInclude = {
  session: {
    select: {
      id: true,
      chapter: { select: { id: true, title: true, material: { select: { id: true, title: true, courseName: true } } } },
      exam: { select: { questions: true, answers: true, grades: true } },
      gaps: { select: { qid: true, evidenceQuote: true, sourceExcerpt: true } },
    },
  },
} satisfies Prisma.WrongNoteInclude;
export type WrongNoteWithRelations = Prisma.WrongNoteGetPayload<{ include: typeof wrongNoteInclude }>;

export function toWrongNoteDto(n: WrongNoteWithRelations): WrongNoteDto {
  const exam = n.session.exam;
  const q = exam?.questions.find((x) => x.qid === n.qid);
  const a = exam?.answers.find((x) => x.qid === n.qid);
  const g = exam?.grades.find((x) => x.qid === n.qid);
  const gap = n.session.gaps.find((x) => x.qid === n.qid);
  const choices = parseChoices(q?.choicesJson);
  return {
    wrongNoteId: n.id,
    sessionId: n.sessionId,
    runId: n.runId,
    qid: n.qid,
    courseName: n.session.chapter.material.courseName,
    materialTitle: n.session.chapter.material.title,
    chapterId: n.session.chapter.id,
    chapterTitle: n.session.chapter.title,
    question: q?.question ?? "",
    ...(choices ? { choices } : {}),
    answer: a?.answer ?? "",
    score: g?.score ?? 0,
    maxScore: g?.maxScore ?? q?.points ?? 0,
    verdict: (g?.verdict as WrongNoteDto["verdict"]) ?? "WRONG",
    userReason: n.userReason,
    aiDiagnosis: n.aiDiagnosis,
    aiComparison: n.aiComparison,
    evidenceQuote: gap?.evidenceQuote ?? "",
    sourceExcerpt: gap?.sourceExcerpt ?? "",
    missedConcepts: parseStringArray(n.missedConceptsJson),
    createdAt: n.createdAt.toISOString(),
  };
}

/** ② 연결 전 기본 비교 문구: 사용자가 먼저 쓴 이유를 받고, 채점 근거(놓친 개념)와 나란히 보여준다. */
export function templateComparison(userReason: string, missed: string[]): string {
  const reason = userReason.trim().replace(/\s+/g, " ");
  const mentioned = missed.filter((c) => reason.includes(c));
  if (missed.length === 0) return `선배는 "${reason}"라고 짚었어요. 채점 기준으로 보면 이 문항은 설명 일부가 자료와 달랐어요. 자료 발췌와 내 설명을 나란히 비교해 보세요.`;
  if (mentioned.length === missed.length) return `맞아요. 선배가 짚은 대로 ${missed.join(", ")}을(를) 새내기에게 가르치지 않은 것이 원인이에요. 다시 가르칠 때 이 개념부터 설명해 주세요.`;
  if (mentioned.length) return `거의 맞아요. ${mentioned.join(", ")}은(는) 정확히 짚었고, ${missed.filter((c) => !mentioned.includes(c)).join(", ")}도 함께 빠졌어요.`;
  return `선배는 "${reason}"라고 생각했군요. 채점 근거로 보면 새내기가 놓친 건 ${missed.join(", ")}이에요. 이 개념을 설명에 넣었는지 다시 확인해 보세요.`;
}

type Diagnoser = (input: {
  question: string;
  answer: string;
  grade: { score: number; maxScore: number; verdict: string; comment: string };
  gap: { title: string; diagnosis: string; sourceExcerpt: string; concepts: string[] } | null;
  userReason: string;
  taught: { ref: number; content: string }[];
}) => Promise<{ agree?: string; comparison: string; missedConcepts?: string[] }>;

export async function aiComparisonFor(input: Parameters<Diagnoser>[0]): Promise<{ comparison: string; missedConcepts: string[] }> {
  const fallback = () => ({ comparison: templateComparison(input.userReason, input.gap?.concepts ?? []), missedConcepts: input.gap?.concepts ?? [] });
  const diagnose = (llm as unknown as { diagnoseWrongNote?: Diagnoser }).diagnoseWrongNote;
  if (typeof diagnose !== "function") return fallback();
  try {
    const out = await diagnose.call(llm, input);
    if (!out || typeof out.comparison !== "string" || !out.comparison.trim()) return fallback();
    return { comparison: out.comparison, missedConcepts: Array.isArray(out.missedConcepts) && out.missedConcepts.length ? out.missedConcepts : input.gap?.concepts ?? [] };
  } catch (err) {
    console.error("[wrong-note] diagnoseWrongNote failed, using template", err);
    return fallback();
  }
}

export async function loadOwnedWrongNote(userId: string, id: string) {
  return db.wrongNote.findFirst({ where: { id, userId }, include: wrongNoteInclude });
}
