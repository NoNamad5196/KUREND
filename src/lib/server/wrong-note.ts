/**
 * [① 게임 코어 P1] 오답노트. AI 진단은 이미 저장된 Gap(diagnosis·evidenceQuote·sourceExcerpt·concepts)에서 즉시 만든다.
 * aiComparison(사용자 이유 vs 실제 원인)은 ② llm.diagnoseWrongNote 가 있으면 그것으로, 없으면 템플릿으로 만든다.
 */
import type { WrongNoteDto } from "@/contracts/game";
import { llm } from "@/lib/llm";
import { db, Prisma } from "@/lib/server/db";
import { parseStringArray } from "@/lib/server/json-fields";
import { parseChoices } from "@/lib/server/session-dto";
import { newId } from "@/lib/server/ids";

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
  const norm = (x: string) => x.replace(/\s|\(.*?\)/g, "").toLowerCase();
  const mentioned = missed.filter((c) => norm(reason).includes(norm(c)));
  const others = missed.filter((c) => !mentioned.includes(c));
  if (missed.length === 0) {
    return `선배는 "${reason}"라고 짚었어요. 채점 기준으로 보면 이 문항은 설명 일부가 자료와 달랐어요. 아래 자료 문장과 내 설명을 나란히 비교해 보세요.`;
  }
  if (mentioned.length) {
    return `맞아요. 선배가 짚은 ${mentioned.join(", ")} 부분이 바로 새내기가 놓친 곳이에요.${others.length ? ` 다시 가르칠 때 ${others.join(", ")}와(과)의 관계도 함께 설명해 주세요.` : " 다시 가르칠 때 이 개념부터 설명해 주세요."}`;
  }
  return `선배는 "${reason}"라고 생각했군요. 채점 근거로 보면 핵심은 ${missed[0]}이에요.${missed.length > 1 ? ` (함께 확인할 개념: ${missed.slice(1).join(", ")})` : ""} 내 설명에 이 개념이 정확히 들어 있었는지 다시 확인해 보세요.`;
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

const GRADED = ["RESULT_READY", "REVIEWING", "COMPLETED"];

/**
 * 틀린(WRONG/PARTIAL) 문항을 오답노트에 자동 저장한다. 이미 있는 (세션, 문항)은 건너뛴다(멱등).
 * sessionId 를 주면 그 세션만, 없으면 사용자의 채점 끝난 세션 전부(백필).
 * 저장 직후 userReason 은 "", aiComparison 은 null — 선배가 이유를 쓰면 PATCH 에서 채운다.
 */
export async function ensureWrongNotes(userId: string, sessionId?: string): Promise<number> {
  const sessions = await db.session.findMany({
    where: {
      userId,
      status: { in: GRADED },
      ...(sessionId ? { id: sessionId } : {}),
      exam: { grades: { some: { verdict: { not: "CORRECT" } } } },
    },
    select: {
      id: true,
      runId: true,
      exam: { select: { grades: { select: { qid: true, verdict: true, comment: true } } } },
      gaps: { select: { qid: true, title: true, diagnosis: true, conceptsJson: true } },
      wrongNotes: { select: { qid: true } },
    },
  });
  let created = 0;
  for (const s of sessions) {
    const have = new Set(s.wrongNotes.map((n) => n.qid));
    for (const g of s.exam?.grades ?? []) {
      if (g.verdict === "CORRECT" || have.has(g.qid)) continue;
      const gap = s.gaps.find((x) => x.qid === g.qid);
      try {
        await db.wrongNote.create({
          data: {
            id: newId("wn"),
            userId,
            runId: s.runId,
            sessionId: s.id,
            qid: g.qid,
            userReason: "",
            aiDiagnosis: gap ? `${gap.title}. ${gap.diagnosis}` : g.comment,
            aiComparison: null,
            missedConceptsJson: gap?.conceptsJson ?? "[]",
          },
        });
        created++;
      } catch {
        // 동시 요청이 먼저 만들었으면 (sessionId, qid) unique 로 실패 → 무시
      }
    }
  }
  return created;
}

/** 선배가 쓴 이유를 저장하고 AI 비교를 만든다 */
export async function writeReason(noteId: string, userReason: string) {
  const note = await db.wrongNote.findUniqueOrThrow({
    where: { id: noteId },
    include: {
      session: {
        select: {
          exam: { select: { questions: true, answers: true, grades: true } },
          gaps: { select: { qid: true, title: true, diagnosis: true, sourceExcerpt: true, conceptsJson: true } },
          messages: { where: { role: "USER", excluded: false }, orderBy: { createdAt: "asc" }, select: { content: true } },
        },
      },
    },
  });
  const exam = note.session.exam;
  const q = exam?.questions.find((x) => x.qid === note.qid);
  const g = exam?.grades.find((x) => x.qid === note.qid);
  const gapRow = note.session.gaps.find((x) => x.qid === note.qid);
  const gap = gapRow ? { title: gapRow.title, diagnosis: gapRow.diagnosis, sourceExcerpt: gapRow.sourceExcerpt, concepts: parseStringArray(gapRow.conceptsJson) } : null;
  const { comparison, missedConcepts } = await aiComparisonFor({
    question: q?.question ?? "",
    answer: exam?.answers.find((x) => x.qid === note.qid)?.answer ?? "",
    grade: { score: g?.score ?? 0, maxScore: g?.maxScore ?? q?.points ?? 0, verdict: g?.verdict ?? "WRONG", comment: g?.comment ?? "" },
    gap,
    userReason,
    taught: note.session.messages.map((m, i) => ({ ref: i + 1, content: m.content })),
  });
  return db.wrongNote.update({
    where: { id: noteId },
    data: { userReason, aiComparison: comparison, missedConceptsJson: JSON.stringify(missedConcepts) },
    include: wrongNoteInclude,
  });
}

export async function loadOwnedWrongNote(userId: string, id: string) {
  return db.wrongNote.findFirst({ where: { id, userId }, include: wrongNoteInclude });
}
