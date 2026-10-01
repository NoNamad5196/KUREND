/**
 * [① 게임 코어] Run 진행 판정 순수 함수. DB 를 모른다.
 */
export type ProgressRow = { chapterId: string; title: string; order: number; attempts: number; bestScore: number | null; cleared: boolean };

/** 챕터 통과: 이 Run 에서의 최고점 ≥ 합격선 */
export const isCleared = (bestScore: number | null, passScore: number) => bestScore !== null && bestScore >= passScore;

export function progressSummary(rows: ProgressRow[]) {
  const chapters = [...rows].sort((a, b) => a.order - b.order);
  const cleared = chapters.filter((c) => c.cleared).length;
  const nextRow = chapters.find((c) => !c.cleared) ?? null;
  return {
    chapters,
    cleared,
    total: chapters.length,
    next: nextRow ? { chapterId: nextRow.chapterId, title: nextRow.title } : null,
  };
}

/** 졸업시험 응시 가능: ACTIVE 이고 챕터가 1개 이상이며 전부 cleared */
export const allChaptersCleared = (status: string, rows: Pick<ProgressRow, "cleared">[]) =>
  status === "ACTIVE" && rows.length > 0 && rows.every((r) => r.cleared);

/** 졸업 가능: 모든 챕터 통과 + 졸업시험 통과 */
export const canGraduate = (status: string, rows: Pick<ProgressRow, "cleared">[], finalPassed: boolean) =>
  allChaptersCleared(status, rows) && finalPassed;

/** 함께한 일수 (시작~종료, 최소 1일) */
export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}
