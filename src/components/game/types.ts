/**
 * [③ 임시] 게임 시스템 타입. ①이 `src/contracts/game.ts`를 올리면 이 파일의 타입/상수는 전부 그쪽 import 로 교체하고 삭제한다.
 * 숫자(합격선·MAX_LIVES)는 계획서 §1-1 값과 동일하게 두되, 여기서는 UI 미리보기 용도로만 쓴다.
 */
export const JUNIOR_CHARACTERS = ["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const;
export type JuniorCharacter = (typeof JUNIOR_CHARACTERS)[number];

export const RUN_STATUSES = ["ACTIVE", "GAME_OVER", "GRADUATED"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const LIFE_OUTCOMES = ["CLEAR", "FAILED", "PERFECT", "NONE"] as const;
export type LifeOutcome = (typeof LIFE_OUTCOMES)[number];

export type ExamFormat = "DESCRIPTIVE" | "OBJECTIVE";

/** TODO(③→①): `CHARACTERS` from "@/contracts/game" 로 교체 */
export const CHARACTERS: Record<
  JuniorCharacter,
  { name: string; label: "EASY" | "NORMAL" | "HARD"; level: "EASY" | "HARD"; examFormat: ExamFormat; passScore: number; tagline: string }
> = {
  MALE_EASY: { name: "남학생", label: "EASY", level: "EASY", examFormat: "OBJECTIVE", passScore: 60, tagline: "이해가 빠른 후배 · 객관식 시험" },
  FEMALE_NORMAL: { name: "여학생", label: "NORMAL", level: "EASY", examFormat: "DESCRIPTIVE", passScore: 70, tagline: "이해는 빠르지만 서술형 시험" },
  KU_HARD: { name: "KU", label: "HARD", level: "HARD", examFormat: "DESCRIPTIVE", passScore: 80, tagline: "이해시키기 어려움 · 반복 설명 필요 · 서술형" },
};
export const DEFAULT_MAX_LIVES = 3;
export const PERFECT_SCORE = 100;

/** 홈 카드·자료 페이지가 쓰는 Run 요약 (RunDto 의 UI 필요분) */
export type RunSummary = {
  runId: string;
  materialId: string;
  materialTitle: string;
  courseName: string;
  character: JuniorCharacter;
  lives: number;
  maxLives: number;
  status: RunStatus;
  progress: { cleared: number; total: number };
  next: { chapterId: string; title: string } | null;
  canGraduate: boolean;
};

/** 결과 오버레이 입력 (ApplyLifeResponse 의 UI 필요분) */
export type LifeResult = {
  outcome: LifeOutcome;
  score: number;
  passScore: number;
  livesBefore: number;
  livesAfter: number;
  maxLives: number;
  runStatus: RunStatus;
  chapter?: { cleared: boolean; bestScore: number | null; firstClear: boolean };
  canGraduate?: boolean;
};

export type GraduationSummary = {
  character: JuniorCharacter;
  materialTitle: string;
  courseName?: string;
  days: number;
  chapters: number;
  exams: number;
  averageScore: number | null;
  perfectCount: number;
  wrongNoteCount: number;
  finalLives: number;
  maxLives: number;
  graduatedAt: string;
};

export type TeacherNote = {
  chapterId: string;
  mustTeach: string[];
  keyTakeaways: string[];
  confusing: string[];
  likelyQuestions: string[];
};
