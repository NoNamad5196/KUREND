/**
 * [① 게임 코어] Run 관련 DTO 조립. 라우트는 여기 함수만 부른다.
 */
import {
  CHARACTERS,
  FINAL_QUESTION_COUNT,
  type GraduationSummaryDto,
  type JuniorCharacter,
  type LifeEventDto,
  type LifeOutcome,
  type RunDto,
  type RunStatus,
} from "@/contracts/game";
import { db, Prisma } from "@/lib/server/db";
import { allChaptersCleared, canGraduate, daysBetween, progressSummary, type ProgressRow } from "@/lib/server/run-rules";

type Tx = Prisma.TransactionClient | typeof db;

export const runInclude = {
  material: {
    select: {
      id: true,
      title: true,
      courseName: true,
      chapters: { select: { id: true, title: true, order: true }, orderBy: { order: "asc" } },
    },
  },
  progress: true,
  sessions: { where: { kind: "FINAL", replacementSessionId: null }, select: { id: true, status: true, score: true, updatedAt: true }, orderBy: { updatedAt: "desc" } },
} satisfies Prisma.JuniorRunInclude;
export type RunWithRelations = Prisma.JuniorRunGetPayload<{ include: typeof runInclude }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function progressRows(run: RunWithRelations): ProgressRow[] {
  const byChapter = new Map(run.progress.map((p) => [p.chapterId, p]));
  return run.material.chapters.map((c) => {
    const p = byChapter.get(c.id);
    return { chapterId: c.id, title: c.title, order: c.order, attempts: p?.attempts ?? 0, bestScore: p?.bestScore ?? null, cleared: p?.cleared ?? false };
  });
}

export function toRunDto(run: RunWithRelations): RunDto {
  const character = run.character as JuniorCharacter;
  const spec = CHARACTERS[character];
  const rows = progressRows(run);
  const summary = progressSummary(rows);
  return {
    runId: run.id,
    materialId: run.material.id,
    materialTitle: run.material.title,
    courseName: run.material.courseName,
    character,
    lives: run.lives,
    maxLives: run.maxLives,
    passScore: spec.passScore,
    examFormat: spec.examFormat,
    status: run.status as RunStatus,
    startedAt: run.startedAt.toISOString(),
    endedAt: iso(run.endedAt),
    progress: { cleared: summary.cleared, total: summary.total, chapters: summary.chapters },
    next: run.status === "ACTIVE" ? summary.next : null,
    finalExam: finalExamOf(run, rows),
    canGraduate: canGraduate(run.status, rows, !!run.finalPassedAt),
  };
}

const OPEN = ["PREPARING", "EXPLAINING", "EXAM_IN_PROGRESS", "EVALUATING"];

/** 졸업시험 상태: 통과 → PASSED, 진행 중 세션 → IN_PROGRESS, 챕터 남음 → LOCKED, 그 외 READY */
export function finalExamOf(run: RunWithRelations, rows: ProgressRow[]): RunDto["finalExam"] {
  const finals = run.sessions;
  const open = finals.find((s) => OPEN.includes(s.status));
  const scored = finals.filter((s) => s.score !== null).map((s) => s.score!);
  const status: RunDto["finalExam"]["status"] = run.finalPassedAt ? "PASSED"
    : open ? "IN_PROGRESS"
    : allChaptersCleared(run.status, rows) ? "READY" : "LOCKED";
  return {
    status,
    sessionId: open?.id ?? finals[0]?.id ?? null,
    bestScore: scored.length ? Math.max(...scored) : null,
    attempts: scored.length,
    questionCount: FINAL_QUESTION_COUNT,
  };
}

export async function loadRun(tx: Tx, runId: string): Promise<RunWithRelations | null> {
  return tx.juniorRun.findUnique({ where: { id: runId }, include: runInclude });
}

export function toLifeEventDto(e: {
  outcome: string;
  delta: number;
  livesBefore: number;
  livesAfter: number;
  score: number;
  passScore: number;
  createdAt: Date;
}): LifeEventDto {
  return {
    outcome: e.outcome as LifeOutcome,
    delta: e.delta,
    livesBefore: e.livesBefore,
    livesAfter: e.livesAfter,
    score: e.score,
    passScore: e.passScore,
    createdAt: e.createdAt.toISOString(),
  };
}

/** 졸업·게임오버 시점 통계. endedAt 기준으로 계산한다. */
export async function computeRunSummary(tx: Tx, run: RunWithRelations, endedAt: Date): Promise<GraduationSummaryDto> {
  const [events, wrongNoteCount] = await Promise.all([
    tx.lifeEvent.findMany({ where: { runId: run.id }, select: { score: true, outcome: true } }),
    tx.wrongNote.count({ where: { runId: run.id } }),
  ]);
  const rows = progressRows(run);
  const avg = events.length ? Math.round(events.reduce((a, e) => a + e.score, 0) / events.length) : null;
  return {
    runId: run.id,
    character: run.character as JuniorCharacter,
    materialTitle: run.material.title,
    courseName: run.material.courseName,
    days: daysBetween(run.startedAt, endedAt),
    chapters: rows.filter((r) => r.cleared).length,
    exams: events.length,
    averageScore: avg,
    perfectCount: events.filter((e) => e.outcome === "PERFECT").length,
    wrongNoteCount,
    finalLives: run.lives,
    maxLives: run.maxLives,
    graduatedAt: endedAt.toISOString(),
  };
}
