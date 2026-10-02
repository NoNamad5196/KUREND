import type { AlbumResponse, JuniorCharacter, RunDto } from "@/contracts/game";

/**
 * "미졸업" 탭의 명단. 후배의 상태는 네 가지다.
 * - 재학생(ENROLLED): 아직 가르칠 목차가 남은 후배
 * - 졸업 직전(NEAR_GRADUATION): 목차를 모두 통과해 최종 졸업시험만 남은 후배(시험을 통과해 졸업식만 남은 경우 포함)
 * - 졸업 실패(FAILED): 체력이 다해 떠난 후배(GAME OVER)
 * - 졸업 성공(GRADUATED): 졸업앨범으로 옮겨 가므로 이 명단에서 사라진다
 */
export type RosterStatus = "NEAR_GRADUATION" | "ENROLLED" | "FAILED";
export const ROSTER_LABEL: Record<RosterStatus, string> = { NEAR_GRADUATION: "졸업 직전", ENROLLED: "재학생", FAILED: "졸업 실패" };
const ROSTER_ORDER: Record<RosterStatus, number> = { NEAR_GRADUATION: 0, ENROLLED: 1, FAILED: 2 };

export type RosterEntry = {
  key: string;
  runId: string;
  status: RosterStatus;
  label: string;
  character: JuniorCharacter;
  materialId: string;
  materialTitle: string;
  courseName: string;
  /** 통과한 챕터 수. total 은 재학생만 안다(떠난 후배는 요약에 통과 수만 남는다) */
  cleared: number;
  total: number | null;
  lives: number;
  maxLives: number;
  /** 함께한 날짜 수(재학생은 오늘까지, 떠난 후배는 떠난 날까지) */
  days: number;
  startedAt: string;
  endedAt: string | null;
  canGraduate: boolean;
  finalExam: RunDto["finalExam"] | null;
};

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: number) => Math.max(1, Math.floor((to - new Date(from).getTime()) / DAY) + 1);

export function rosterOf(album: Pick<AlbumResponse, "active" | "departed">, now = Date.now()): RosterEntry[] {
  const enrolled = (album.active ?? []).filter((run) => run.status === "ACTIVE").map((run): RosterEntry => {
    // 최종 졸업시험만 남았으면(목차 전부 통과: 응시 가능·진행 중·통과 후 졸업식 대기) 졸업 직전
    const status: RosterStatus = run.canGraduate || (run.progress.total > 0 && run.progress.cleared >= run.progress.total) || run.finalExam.status !== "LOCKED" ? "NEAR_GRADUATION" : "ENROLLED";
    return {
    key: run.runId, runId: run.runId, status, label: ROSTER_LABEL[status],
    character: run.character, materialId: run.materialId, materialTitle: run.materialTitle, courseName: run.courseName,
    cleared: run.progress.cleared, total: run.progress.total, lives: run.lives, maxLives: run.maxLives,
    days: daysBetween(run.startedAt, now), startedAt: run.startedAt, endedAt: null,
    canGraduate: run.canGraduate, finalExam: run.finalExam,
    };
  }).sort((a, b) => ROSTER_ORDER[a.status] - ROSTER_ORDER[b.status]);
  const failed = [...album.departed]
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
    .map((entry): RosterEntry => ({
      key: entry.runId, runId: entry.runId, status: "FAILED", label: ROSTER_LABEL.FAILED,
      character: entry.character, materialId: entry.materialId, materialTitle: entry.materialTitle, courseName: entry.courseName,
      cleared: entry.summary?.chapters ?? 0, total: null, lives: entry.summary?.finalLives ?? 0, maxLives: entry.summary?.maxLives ?? 3,
      days: entry.summary?.days ?? daysBetween(entry.startedAt, new Date(entry.endedAt).getTime()), startedAt: entry.startedAt, endedAt: entry.endedAt,
      canGraduate: false, finalExam: null,
    }));
  return [...enrolled, ...failed];
}

/** 카드의 한 줄 상태 설명 */
export function rosterNote(entry: RosterEntry): string {
  if (entry.status === "FAILED") return "체력이 모두 떨어져 졸업하지 못했어요. 자료는 그대로 남아 있어요.";
  if (entry.canGraduate) return "졸업시험 통과! 졸업식을 열면 졸업 성공으로 졸업앨범에 걸려요.";
  const exam = entry.finalExam;
  if (exam?.status === "IN_PROGRESS") return `졸업시험 진행 중 · ${exam.questionCount}문항`;
  if (exam?.status === "READY") return exam.attempts > 0 ? `졸업시험 ${exam.attempts}회 불합격 · 다시 도전할 수 있어요` : "목차를 모두 통과했어요 · 최종 졸업시험만 남았어요";
  return entry.total !== null ? `목차 ${entry.total}개 중 ${entry.cleared}개 통과` : "가르치는 중";
}
