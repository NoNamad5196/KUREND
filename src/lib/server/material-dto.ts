/** [C 소유] 자료/홈 DTO 변환 (§5-3, §5-4) */
import type {
  ChapterAction,
  ChapterDto,
  HomeDto,
  MaterialDto,
  MaterialListItemDto,
  SessionStatus,
  SourceDto,
} from "@/contracts/types";
import { stageLabelFor } from "@/contracts/types";
import { Prisma } from "@/lib/server/db";
import { parseStringArray } from "@/lib/server/json-fields";
import { isOpenStatus } from "@/lib/server/session-dto";
import { averageScore, dDayFor, streakDays, toDateOnly } from "@/lib/server/stats";

export const materialInclude = {
  runs: { where: { status: "ACTIVE" }, orderBy: { startedAt: "desc" }, take: 1, select: { id: true } },
  sources: { select: { id: true, kind: true, fileName: true, charCount: true } },
  chapters: {
    orderBy: { order: "asc" },
    include: {
      sessions: {
        where: { replacementSessionId: null, kind: "CHAPTER" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, runId: true, status: true, score: true, updatedAt: true, completedAt: true, gaps: { select: { status: true } } },
      },
    },
  },
} satisfies Prisma.MaterialInclude;
export type MaterialWithRelations = Prisma.MaterialGetPayload<{ include: typeof materialInclude }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toSourceDto(s: { id: string; kind: string; fileName: string; charCount: number }): SourceDto {
  return { sourceId: s.id, kind: s.kind as SourceDto["kind"], fileName: s.fileName, charCount: s.charCount };
}

/**
 * §5-4-1 action: 진행 중 세션 있으면 CONTINUE(최신), 완료 세션만 있으면 RETRY, 없으면 START.
 * bestScore = 완료 세션 최고점, openGapCount = 가장 최근 완료 세션의 FOUND gap 수.
 */
export function toChapterDto(c: MaterialWithRelations["chapters"][number], runId?: string | null): ChapterDto {
  const open = c.sessions.find((s) => isOpenStatus(s.status) && (runId === undefined || s.runId === runId));
  const completed = c.sessions.filter((s) => s.status === "COMPLETED");
  let action: ChapterAction = { kind: "START" };
  if (open) action = { kind: "CONTINUE", sessionId: open.id, status: open.status as SessionStatus };
  else if (completed.length > 0) action = { kind: "RETRY" };

  const scores = completed.map((s) => s.score).filter((x): x is number => typeof x === "number");
  const latestCompleted = completed
    .slice()
    .sort((a, b) => (b.completedAt ?? b.updatedAt).getTime() - (a.completedAt ?? a.updatedAt).getTime())[0];

  return {
    chapterId: c.id,
    order: c.order,
    title: c.title,
    points: parseStringArray(c.pointsJson),
    sourceId: c.sourceId,
    startOffset: c.startOffset,
    endOffset: c.endOffset,
    action,
    taughtAt: iso(c.taughtAt),
    stableAt: iso(c.stableAt),
    bestScore: scores.length ? Math.max(...scores) : null,
    openGapCount: latestCompleted ? latestCompleted.gaps.filter((g) => g.status === "FOUND").length : 0,
  };
}

export function toMaterialDto(m: MaterialWithRelations): MaterialDto {
  return {
    materialId: m.id,
    title: m.title,
    courseName: m.courseName,
    examDate: toDateOnly(m.examDate),
    status: m.status as MaterialDto["status"],
    error: m.error ?? null,
    sources: m.sources.map(toSourceDto),
    chapters: m.chapters.map((chapter) => toChapterDto(chapter, m.runs[0]?.id ?? null)),
  };
}

export type MaterialForList = Prisma.MaterialGetPayload<{
  include: { chapters: { select: { taughtAt: true } } };
}>;

export function toMaterialListItem(m: MaterialForList): MaterialListItemDto {
  return {
    materialId: m.id,
    title: m.title,
    courseName: m.courseName,
    examDate: toDateOnly(m.examDate),
    status: m.status as MaterialListItemDto["status"],
    chapterCount: m.chapters.length,
    taughtCount: m.chapters.filter((c) => c.taughtAt).length,
    createdAt: m.createdAt.toISOString(),
  };
}

/* ───────── §5-3 홈 ───────── */
export const homeMaterialInclude = {
  runs: { where: { status: "ACTIVE" }, orderBy: { startedAt: "desc" }, take: 1, select: { id: true } },
  chapters: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      taughtAt: true,
      sessions: { where: { replacementSessionId: null, kind: "CHAPTER" }, orderBy: { updatedAt: "desc" }, select: { id: true, runId: true, status: true, updatedAt: true } },
    },
  },
} satisfies Prisma.MaterialInclude;
export type MaterialForHome = Prisma.MaterialGetPayload<{ include: typeof homeMaterialInclude }>;

export type SessionForHome = Prisma.SessionGetPayload<{
  include: { chapter: { select: { title: true, material: { select: { title: true } } } } };
}>;

export function buildHomeDto(input: {
  user: { nickname: string };
  materials: MaterialForHome[];
  recentSessions: SessionForHome[];
  completedSessions: Array<{ score: number | null; completedAt: Date | null; updatedAt: Date }>;
  now?: Date;
}): HomeDto {
  const now = input.now ?? new Date();

  // 과목별 묶기 (자료 생성순 → 과목 첫 등장 순)
  const byCourse = new Map<string, MaterialForHome[]>();
  for (const m of input.materials) {
    const list = byCourse.get(m.courseName) ?? [];
    list.push(m);
    byCourse.set(m.courseName, list);
  }

  const courses: HomeDto["courses"] = [...byCourse.entries()].map(([courseName, mats]) => {
    const dates = mats.map((m) => m.examDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    const examDate = dates[0] ?? null;
    return {
      courseName,
      examDate: toDateOnly(examDate),
      dDay: dDayFor(examDate, now),
      materials: mats.map((m) => {
        // 가장 최근에 갱신된 진행 중 세션 1개
        const open = m.chapters
          .flatMap((c) => c.sessions.filter((s) => isOpenStatus(s.status) && s.runId === (m.runs[0]?.id ?? null)).map((s) => ({ ...s, chapterTitle: c.title })))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
        return {
          materialId: m.id,
          title: m.title,
          chapterCount: m.chapters.length,
          taughtCount: m.chapters.filter((c) => c.taughtAt).length,
          resume: open
            ? {
                sessionId: open.id,
                chapterTitle: open.chapterTitle,
                status: open.status as SessionStatus,
                stageLabel: stageLabelFor(open.status as SessionStatus),
              }
            : null,
        };
      }),
    };
  });

  // 시험일이 가까운 과목 먼저, 시험일 없는 과목은 뒤로
  courses.sort((a, b) => (a.dDay ?? Number.MAX_SAFE_INTEGER) - (b.dDay ?? Number.MAX_SAFE_INTEGER));

  return {
    userName: input.user.nickname,
    courses,
    recentSessions: input.recentSessions.map((s) => ({
      sessionId: s.id,
      chapterTitle: s.chapter.title,
      materialTitle: s.chapter.material.title,
      status: s.status as SessionStatus,
      score: s.score ?? null,
      finalVerdict: (s.finalVerdict as HomeDto["recentSessions"][number]["finalVerdict"]) ?? null,
      updatedAt: s.updatedAt.toISOString(),
    })),
    stats: {
      completedSessions: input.completedSessions.length,
      averageScore: averageScore(input.completedSessions.map((s) => s.score)),
      streakDays: streakDays(
        input.completedSessions.map((s) => s.completedAt ?? s.updatedAt),
        now,
      ),
    },
  };
}
