/**
 * 업적 — 새 API 없이 이미 있는 데이터(/home · /sessions · 졸업앨범 · 오답노트 · 현재 후배)로 클라이언트에서 계산한다.
 *
 *   const inputs = await loadAchievementInputs();
 *   const list = computeAchievements(inputs);   // 정의 순서 그대로
 *   nextAchievement(list)                        // 가장 가까운 잠긴 업적
 *
 * 규칙: 시험·완주·졸업 기록으로만 열린다. 서버 기록에서 확실히 계산되는 것만 둔다.
 */
import type { HomeDto, SessionListItemDto } from "@/contracts/types";
import type { AlbumResponse, JuniorCharacter, RunDto, WrongNoteDto } from "@/contracts/game";
import { CHARACTERS, JUNIOR_CHARACTERS, PERFECT_SCORE } from "@/contracts/game";
import { api } from "./api";
import { gameApi } from "./game-api";

export type AchievementCategory = "lesson" | "exam" | "streak" | "graduation" | "notes";

export type Achievement = {
  id: string;
  title: string;
  /** 무엇을 하면 열리는지 (짧게) */
  description: string;
  icon: string;
  category: AchievementCategory;
  /** 0 ≤ progress ≤ goal */
  progress: number;
  goal: number;
  unlocked: boolean;
  /** 아직 잠겨 있을 때 보여 줄 한 줄 힌트 */
  unlockedHint: string;
};

export type AchievementInputs = {
  home: HomeDto;
  sessions: SessionListItemDto[];
  album: AlbumResponse;
  wrongNotes: WrongNoteDto[];
  run: RunDto | null;
  /** 일부 기록(세션·앨범·오답노트·현재 후배)을 못 불러와 0 으로 계산한 경우 true */
  partial: boolean;
};

const EMPTY_ALBUM: AlbumResponse = { graduated: [], departed: [], active: [] };
/** 가장 높은 합격선(KU 80점). 이 점수 이상이면 어느 후배든 합격이다. */
const HIGHEST_PASS = Math.max(...JUNIOR_CHARACTERS.map((c) => CHARACTERS[c].passScore));

/** /home 은 필수, 나머지는 실패해도 빈 값으로 계산한다(partial 표시). */
export async function loadAchievementInputs(): Promise<AchievementInputs> {
  const [home, sessions, album, wrongNotes, run] = await Promise.allSettled([
    api.get<HomeDto>("/home"),
    api.get<SessionListItemDto[]>("/sessions"),
    gameApi.getAlbum(),
    gameApi.listWrongNotes(),
    gameApi.getCurrentRun(),
  ]);
  if (home.status === "rejected") throw home.reason;
  const ok = <T,>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === "fulfilled" && r.value != null ? r.value : fallback);
  return {
    home: home.value,
    sessions: ok(sessions, []),
    album: ok(album, EMPTY_ALBUM),
    wrongNotes: ok(wrongNotes, []),
    run: run.status === "fulfilled" ? run.value ?? null : null,
    partial: [sessions, album, wrongNotes, run].some((r) => r.status === "rejected"),
  };
}

/* ───────── 계산 도우미 ───────── */
function localDayStamp(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 날짜 목록에서 가장 길게 이어진 연속 학습일 */
export function longestStreak(isoDates: string[]): number {
  const days = [...new Set(isoDates.map(localDayStamp).filter((d): d is number => d !== null))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && Math.round((days[i] - days[i - 1]) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export type AchievementStats = {
  completed: number;
  bestStreak: number;
  perfects: number;
  passed: boolean;
  courses: number;
  reasonedNotes: number;
  graduated: number;
  graduatedCharacters: JuniorCharacter[];
  crisisGraduations: number;
};

export function achievementStats({ home, sessions, album, wrongNotes, run }: AchievementInputs): AchievementStats {
  const completedSessions = sessions.filter((s) => s.status === "COMPLETED");
  const ended = [...album.graduated, ...album.departed];
  const scores = sessions.map((s) => s.score).filter((s): s is number => typeof s === "number");

  const runCleared = (run?.progress.chapters.filter((c) => c.cleared).length ?? 0) + (run?.finalExam.status === "PASSED" ? 1 : 0);
  const albumCleared = ended.reduce((sum, e) => sum + (e.summary?.chapters ?? 0), 0);
  const passed = runCleared > 0 || albumCleared > 0 || album.graduated.length > 0 || scores.some((s) => s >= HIGHEST_PASS);

  const albumPerfects = ended.reduce((sum, e) => sum + (e.summary?.perfectCount ?? 0), 0);
  const graduatedCharacters = JUNIOR_CHARACTERS.filter((c) => album.graduated.some((e) => e.character === c));

  return {
    completed: Math.max(home.stats.completedSessions, completedSessions.length),
    bestStreak: Math.max(home.stats.streakDays, longestStreak(completedSessions.map((s) => s.updatedAt))),
    perfects: Math.max(scores.filter((s) => s >= PERFECT_SCORE).length, albumPerfects),
    passed,
    courses: new Set(completedSessions.map((s) => s.courseName.trim()).filter(Boolean)).size,
    reasonedNotes: wrongNotes.filter((n) => n.userReason.trim().length > 0).length,
    graduated: album.graduated.length,
    graduatedCharacters,
    crisisGraduations: album.graduated.filter((e) => e.summary?.finalLives === 1).length,
  };
}

/* ───────── 업적 정의 ───────── */
type Def = Omit<Achievement, "progress" | "unlocked"> & { value: (s: AchievementStats) => number };

const NAMES: Record<JuniorCharacter, string> = { MALE_EASY: "컴돌이", FEMALE_NORMAL: "컴순이", KU_HARD: "KU" };

function defs(stats: AchievementStats): Def[] {
  const missing = JUNIOR_CHARACTERS.filter((c) => !stats.graduatedCharacters.includes(c)).map((c) => NAMES[c]);
  return [
    { id: "first-lesson", icon: "📖", category: "lesson", title: "첫 수업", description: "수업 1회 끝까지 마치기", goal: 1, unlockedHint: "아무 목차나 골라 끝까지 가르쳐 보세요.", value: (s) => s.completed },
    { id: "first-pass", icon: "✅", category: "exam", title: "첫 시험 합격", description: "후배가 합격선 처음 넘기", goal: 1, unlockedHint: "후배 합격선(60·70·80점)을 넘겨 보세요.", value: (s) => (s.passed ? 1 : 0) },
    { id: "perfect", icon: "💯", category: "exam", title: "PERFECT 선배", description: "시험 100점 1회", goal: 1, unlockedHint: "후배가 한 문제도 틀리지 않게 가르쳐 보세요.", value: (s) => s.perfects },
    { id: "perfect-3", icon: "🌟", category: "exam", title: "만점 제조기", description: "시험 100점 3회", goal: 3, unlockedHint: "100점을 받으면 LIFE 도 하나 돌아와요.", value: (s) => s.perfects },
    { id: "streak-3", icon: "🔥", category: "streak", title: "꾸준함", description: "3일 연속 수업 완주", goal: 3, unlockedHint: "하루에 한 번씩 수업을 마쳐 보세요.", value: (s) => s.bestStreak },
    { id: "streak-7", icon: "📅", category: "streak", title: "일주일 개근", description: "7일 연속 수업 완주", goal: 7, unlockedHint: "하루도 빠짐없이 일주일을 채워 보세요.", value: (s) => s.bestStreak },
    { id: "lessons-10", icon: "🏃", category: "lesson", title: "열 번의 수업", description: "수업 10회 완주", goal: 10, unlockedHint: "수업을 끝까지 마칠 때마다 1회씩 쌓여요.", value: (s) => s.completed },
    { id: "two-courses", icon: "📚", category: "lesson", title: "두 과목 정복", description: "서로 다른 2과목에서 수업 완주", goal: 2, unlockedHint: "다른 과목 자료도 올려서 가르쳐 보세요.", value: (s) => s.courses },
    { id: "notes-5", icon: "✍️", category: "notes", title: "오답 탐구가", description: "오답노트에 이유 5개 쓰기", goal: 5, unlockedHint: "틀린 문항에 내가 생각한 이유를 적어 보세요.", value: (s) => s.reasonedNotes },
    { id: "first-graduation", icon: "🎓", category: "graduation", title: "첫 졸업", description: "후배 1명 졸업시키기", goal: 1, unlockedHint: "모든 챕터와 졸업시험을 통과해 보세요.", value: (s) => s.graduated },
    { id: "crisis", icon: "💪", category: "graduation", title: "위기 탈출", description: "LIFE 1개 남기고 졸업", goal: 1, unlockedHint: "하트가 하나 남아도 포기하지 마세요.", value: (s) => s.crisisGraduations },
    { id: "ku-graduation", icon: "🐂", category: "graduation", title: "KU 길들이기", description: "HARD 후배 KU 졸업", goal: 1, unlockedHint: "가장 까다로운 KU를 끝까지 가르쳐 보세요.", value: (s) => (s.graduatedCharacters.includes("KU_HARD") ? 1 : 0) },
    { id: "all-graduation", icon: "🏆", category: "graduation", title: "세 후배 모두 졸업", description: "컴돌이·컴순이·KU 모두 졸업", goal: 3, unlockedHint: missing.length ? `아직 남은 후배: ${missing.join(", ")}` : "세 후배를 모두 졸업시켜 보세요.", value: (s) => s.graduatedCharacters.length },
  ];
}

export function computeAchievements(inputs: AchievementInputs): Achievement[] {
  const stats = achievementStats(inputs);
  return defs(stats).map(({ value, ...def }) => {
    const raw = Math.max(0, Math.floor(value(stats)));
    return { ...def, progress: Math.min(raw, def.goal), unlocked: raw >= def.goal };
  });
}

/** 잠긴 업적을 "거의 다 온 순"으로: 달성률 높은 순 → 남은 양 적은 순 → 정의 순 */
export function sortByCloseness(list: Achievement[]): Achievement[] {
  return list
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !a.unlocked)
    .sort((x, y) => y.a.progress / y.a.goal - x.a.progress / x.a.goal || (x.a.goal - x.a.progress) - (y.a.goal - y.a.progress) || x.i - y.i)
    .map(({ a }) => a);
}

export function nextAchievement(list: Achievement[]): Achievement | null {
  return sortByCloseness(list)[0] ?? null;
}
