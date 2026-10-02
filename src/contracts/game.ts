/**
 * [① 게임 코어 소유] 게임 확장 계약: 후배(Run)·LIFE·졸업·강의노트·오답노트.
 * docs/game-expansion-plan.md §1. ②·③은 import 만 하고 수정은 ①에게 요청한다.
 * 상수 + 순수 함수 + zod 스키마 + 타입을 한 파일에 둔다.
 */
import { z } from "zod";
import { LearningErrorReasonSchema, type JuniorLevel } from "./types";

/* ───────── 열거형 ───────── */
export const JUNIOR_CHARACTERS = ["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const;
export type JuniorCharacter = (typeof JUNIOR_CHARACTERS)[number];
export const JuniorCharacterSchema = z.enum(JUNIOR_CHARACTERS);

export const RUN_STATUSES = ["ACTIVE", "GAME_OVER", "GRADUATED"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const RunStatusSchema = z.enum(RUN_STATUSES);

export const LIFE_OUTCOMES = ["CLEAR", "FAILED", "PERFECT", "NONE"] as const;
export type LifeOutcome = (typeof LIFE_OUTCOMES)[number];
export const LifeOutcomeSchema = z.enum(LIFE_OUTCOMES);

/** MIXED = 졸업시험(객관식 + 서술형 섞음) */
export const EXAM_FORMATS = ["DESCRIPTIVE", "OBJECTIVE", "MIXED"] as const;
export type ExamFormat = (typeof EXAM_FORMATS)[number];
export const ExamFormatSchema = z.enum(EXAM_FORMATS);

export const SESSION_KINDS = ["CHAPTER", "FINAL"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/** FROZEN API_ERROR_CODES 와 별개. RUN_ACTIVE·NOT_READY 409, NO_RUN 404 */
export const GAME_ERROR_CODES = ["RUN_ACTIVE", "NOT_READY", "NO_RUN"] as const;
export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];

/* ───────── 캐릭터 · 룰 상수 ───────── */
export type CharacterSpec = {
  name: string;
  label: "EASY" | "NORMAL" | "HARD";
  level: JuniorLevel;
  examFormat: ExamFormat;
  passScore: number;
  /** 챕터 학습 목표와 일대일 대응하는 시험 문항 수 */
  questionCount: number;
  tagline: string;
};

export const CHARACTERS: Record<JuniorCharacter, CharacterSpec> = {
  MALE_EASY: { name: "컴돌이", label: "EASY", level: "EASY", examFormat: "OBJECTIVE", passScore: 60, questionCount: 5, tagline: "이해가 빠른 후배 · 객관식 5문항" },
  FEMALE_NORMAL: { name: "컴순이", label: "NORMAL", level: "EASY", examFormat: "DESCRIPTIVE", passScore: 70, questionCount: 5, tagline: "이해는 빠르지만 서술형 5문항" },
  KU_HARD: { name: "KU", label: "HARD", level: "HARD", examFormat: "DESCRIPTIVE", passScore: 80, questionCount: 5, tagline: "이해시키기 어려움 · 반복 설명 필요 · 서술형 5문항" },
};

export const DEFAULT_MAX_LIVES = 3;
export const MAX_LIVES_OPTIONS = [3, 5] as const;
export const PERFECT_SCORE = 100;

/** 졸업시험: 자료 전체 범위, 객관식 + 서술형 섞어 10문항 */
export const FINAL_QUESTION_COUNT = 10;
/** 후배 없는 연습 세션의 문항 수 */
export const PRACTICE_QUESTION_COUNT = 3;

export const passScoreFor = (c: JuniorCharacter): number => CHARACTERS[c].passScore;
export const questionCountFor = (c: JuniorCharacter): number => CHARACTERS[c].questionCount;

/** 문항 수 n 에 대해 합계 100 이 되는 배점 (앞 문항부터 1점씩 더 받음): 3 → 34/33/33, 7 → 15,15,14…, 10 → 10×10 */
export function pointsPlan(n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const base = Math.floor(100 / count);
  const extra = 100 - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Each question evaluates its own learning objective, never a recycled topic. */
export const objectiveRefFor = (index: number): string => `o${index + 1}`;

/** MIXED(졸업시험)에서 객관식인 문항: 앞쪽 절반(올림) — 10문항이면 q1~q5 객관식, q6~q10 서술형 */
export function isObjectiveQuestion(format: ExamFormat, index: number, count: number): boolean {
  if (format === "OBJECTIVE") return true;
  if (format === "MIXED") return index < Math.ceil(count / 2);
  return false;
}
export const levelFor = (c: JuniorCharacter): JuniorLevel => CHARACTERS[c].level;
export const examFormatFor = (c: JuniorCharacter): ExamFormat => CHARACTERS[c].examFormat;

/**
 * 시험 1회 결과 → LIFE 변화.
 * score < passScore → FAILED −1 / score == 100 → PERFECT +1 (lives < maxLives 일 때만, 아니면 0) / 그 외 CLEAR 0
 */
export function lifeOutcomeFor(input: { score: number; passScore: number; lives: number; maxLives: number }): {
  outcome: Exclude<LifeOutcome, "NONE">;
  delta: number;
} {
  const { score, passScore, lives, maxLives } = input;
  if (score < passScore) return { outcome: "FAILED", delta: lives > 0 ? -1 : 0 };
  if (score >= PERFECT_SCORE) return { outcome: "PERFECT", delta: lives < maxLives ? 1 : 0 };
  return { outcome: "CLEAR", delta: 0 };
}

/* ───────── DTO ───────── */
export const ConceptMasterySchema = z.object({
  concept: z.string(),
  exposureCount: z.number().int(),
  mastery: z.number().int().min(0).max(100),
});
export type ConceptMasteryDto = z.infer<typeof ConceptMasterySchema>;

export const RunChapterProgressSchema = z.object({
  chapterId: z.string(),
  title: z.string(),
  order: z.number().int(),
  attempts: z.number().int(),
  bestScore: z.number().int().nullable(),
  cleared: z.boolean(),
});
export type RunChapterProgressDto = z.infer<typeof RunChapterProgressSchema>;

export const RunSchema = z.object({
  runId: z.string(),
  materialId: z.string(),
  materialTitle: z.string(),
  courseName: z.string(),
  character: JuniorCharacterSchema,
  lives: z.number().int(),
  maxLives: z.number().int(),
  passScore: z.number().int(),
  examFormat: ExamFormatSchema,
  status: RunStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  progress: z.object({
    cleared: z.number().int(),
    total: z.number().int(),
    chapters: z.array(RunChapterProgressSchema),
  }),
  next: z.object({ chapterId: z.string(), title: z.string() }).nullable(),
  /** 졸업시험: LOCKED(챕터 남음) · READY(응시 가능) · IN_PROGRESS · PASSED. 통과해야 졸업 */
  finalExam: z.object({
    status: z.enum(["LOCKED", "READY", "IN_PROGRESS", "PASSED"]),
    sessionId: z.string().nullable(),
    bestScore: z.number().int().nullable(),
    attempts: z.number().int(),
    questionCount: z.number().int(),
  }),
  canGraduate: z.boolean(),
});
export type RunDto = z.infer<typeof RunSchema>;

export const CurrentRunResponseSchema = z.object({ run: RunSchema.nullable() });
export type CurrentRunResponse = z.infer<typeof CurrentRunResponseSchema>;

export const ApplyLifeResponseSchema = z.object({
  applied: z.boolean(),
  outcome: LifeOutcomeSchema,
  score: z.number().int(),
  passScore: z.number().int(),
  livesBefore: z.number().int(),
  livesAfter: z.number().int(),
  maxLives: z.number().int(),
  runStatus: RunStatusSchema,
  chapter: z.object({ cleared: z.boolean(), bestScore: z.number().int().nullable(), firstClear: z.boolean() }),
  canGraduate: z.boolean(),
});
export type ApplyLifeResponse = z.infer<typeof ApplyLifeResponseSchema>;

export const LifeEventSchema = z.object({
  outcome: LifeOutcomeSchema,
  delta: z.number().int(),
  livesBefore: z.number().int(),
  livesAfter: z.number().int(),
  score: z.number().int(),
  passScore: z.number().int(),
  createdAt: z.string(),
});
export type LifeEventDto = z.infer<typeof LifeEventSchema>;

/** run 이 null 이면(연습 모드) passScore null · examFormat "DESCRIPTIVE" */
export const SessionGameSchema = z.object({
  run: RunSchema.nullable(),
  examFormat: ExamFormatSchema,
  passScore: z.number().int().nullable(),
  lifeEvent: LifeEventSchema.nullable(),
  mastery: z.array(ConceptMasterySchema),
  /** CHAPTER | FINAL(졸업시험) */
  kind: z.enum(SESSION_KINDS).optional(),
  /** 이 세션의 문항 수 (챕터 5 · 졸업시험 10 · 연습 3, 기존 세션은 저장된 수 유지) */
  questionCount: z.number().int().optional(),
});
export type SessionGameDto = z.infer<typeof SessionGameSchema>;

export const GraduationSummarySchema = z.object({
  runId: z.string(),
  character: JuniorCharacterSchema,
  materialTitle: z.string(),
  courseName: z.string(),
  days: z.number().int(),
  chapters: z.number().int(),
  exams: z.number().int(),
  averageScore: z.number().int().nullable(),
  perfectCount: z.number().int(),
  wrongNoteCount: z.number().int(),
  finalLives: z.number().int(),
  maxLives: z.number().int(),
  graduatedAt: z.string(),
});
export type GraduationSummaryDto = z.infer<typeof GraduationSummarySchema>;

/** POST /runs/{id}/graduate 응답: 졸업한 Run + 요약 */
export const GraduateResponseSchema = z.object({ run: RunSchema, summary: GraduationSummarySchema });
export type GraduateResponse = z.infer<typeof GraduateResponseSchema>;

/** ② generateTeacherNote 출력 shape 그대로 */
export const TeacherNoteSchema = z.object({
  chapterId: z.string(),
  mustTeach: z.array(z.string()),
  keyTakeaways: z.array(z.string()),
  confusing: z.array(z.string()),
  likelyQuestions: z.array(z.string()),
});
export type TeacherNoteDto = z.infer<typeof TeacherNoteSchema>;

export const TeacherNoteListResponseSchema = z.object({
  chapters: z.array(z.object({ chapterId: z.string(), title: z.string(), note: TeacherNoteSchema.nullable() })),
});
export type TeacherNoteListResponse = z.infer<typeof TeacherNoteListResponseSchema>;

export const WrongNoteSchema = z.object({
  wrongNoteId: z.string(),
  sessionId: z.string(),
  runId: z.string().nullable(),
  qid: z.string(),
  courseName: z.string(),
  materialTitle: z.string(),
  chapterId: z.string(),
  chapterTitle: z.string(),
  question: z.string(),
  choices: z.array(z.string()).optional(),
  answer: z.string(),
  score: z.number().int(),
  maxScore: z.number().int(),
  verdict: z.enum(["CORRECT", "PARTIAL", "WRONG"]),
  /** 선배가 쓴 이유. 자동 저장 직후에는 "" */
  userReason: z.string(),
  aiDiagnosis: z.string(),
  aiComparison: z.string().nullable(),
  evidenceQuote: z.string(),
  errorReason: LearningErrorReasonSchema.optional(),
  sourceExcerpt: z.string(),
  missedConcepts: z.array(z.string()),
  createdAt: z.string(),
});
export type WrongNoteDto = z.infer<typeof WrongNoteSchema>;

/** ② 의 SessionRecord.game? 용 스냅샷 (prisma-backend 가 채운다) */
export type SessionGameSnapshot = {
  runId: string;
  character: JuniorCharacter;
  lives: number;
  maxLives: number;
  passScore: number;
  examFormat: ExamFormat;
  mastery: ConceptMasteryDto[];
  /** 이 세션 시험의 문항 수 (후배 3/5/7, 졸업시험 10) */
  questionCount?: number;
  /** CHAPTER | FINAL(졸업시험) */
  kind?: SessionKind;
};

export const WrongNoteListResponseSchema = z.object({ notes: z.array(WrongNoteSchema) });
export type WrongNoteListResponse = z.infer<typeof WrongNoteListResponseSchema>;

export const ReteachResponseSchema = z.object({ sessionId: z.string(), focusConcepts: z.array(z.string()) });
export type ReteachResponse = z.infer<typeof ReteachResponseSchema>;

/** P2 졸업앨범: 졸업생 + 떠나간 후배(졸업 실패) + 재학생(active, 아직 가르치는 중인 후배) */
export const AlbumEntrySchema = z.object({
  runId: z.string(),
  character: JuniorCharacterSchema,
  status: z.enum(["GAME_OVER", "GRADUATED"]),
  materialId: z.string(),
  materialTitle: z.string(),
  courseName: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  summary: GraduationSummarySchema.nullable(),
});
export type AlbumEntryDto = z.infer<typeof AlbumEntrySchema>;
export const AlbumResponseSchema = z.object({
  graduated: z.array(AlbumEntrySchema),
  departed: z.array(AlbumEntrySchema),
  /** 미졸업 탭의 재학생: ACTIVE 런(최근 활동순). 졸업하면 graduated(졸업앨범)로 옮겨 가고 여기서 사라진다 */
  active: z.array(RunSchema).default([]),
});
export type AlbumResponse = z.infer<typeof AlbumResponseSchema>;

/* ───────── 요청 ───────── */
export const CreateRunRequestSchema = z.object({
  materialId: z.string(),
  character: JuniorCharacterSchema,
  maxLives: z.union([z.literal(3), z.literal(5)]).optional(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

export const ChangeCharacterRequestSchema = z.object({
  character: JuniorCharacterSchema,
  chapterId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
});
export type ChangeCharacterRequest = z.infer<typeof ChangeCharacterRequestSchema>;
export type ChangeCharacterResponse = { run: RunDto; sessionId: string | null };

/** POST /runs/{id}/final → 졸업시험 세션 (이미 진행 중이면 그 세션) */
export const StartFinalResponseSchema = z.object({ sessionId: z.string(), created: z.boolean() });
export type StartFinalResponse = z.infer<typeof StartFinalResponseSchema>;

export const ApplyLifeRequestSchema = z.object({ sessionId: z.string() });
export type ApplyLifeRequest = z.infer<typeof ApplyLifeRequestSchema>;

export const TeacherNoteRequestSchema = z.object({ chapterId: z.string() });
export type TeacherNoteRequest = z.infer<typeof TeacherNoteRequestSchema>;

/** 틀린 문항은 채점 후 자동으로 저장된다(userReason ""). 이 요청은 수동 생성/이유 채우기용. */
export const CreateWrongNoteRequestSchema = z.object({
  sessionId: z.string(),
  qid: z.string(),
  userReason: z.string().trim().max(1000).optional(),
});
export type CreateWrongNoteRequest = z.infer<typeof CreateWrongNoteRequestSchema>;

/** PATCH /wrong-notes/{id}: 선배가 쓴 이유 저장 → AI 비교(aiComparison) 생성 */
export const UpdateWrongNoteRequestSchema = z.object({ userReason: z.string().trim().min(1).max(1000) });
export type UpdateWrongNoteRequest = z.infer<typeof UpdateWrongNoteRequestSchema>;
