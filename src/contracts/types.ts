/**
 * [FROZEN] 도메인 타입 + zod 스키마. 설계서 §3·§5 그대로.
 * 변경은 팀 합의 후 소유자(A)만 수정한다.
 */
import { z } from "zod";

/* ───────── 열거형 ───────── */
export const SESSION_STATUSES = [
  "PREPARING", "EXPLAINING", "EXAM_IN_PROGRESS", "EVALUATING",
  "RESULT_READY", "REVIEWING", "COMPLETED", "FAILED",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SessionStatusSchema = z.enum(SESSION_STATUSES);

export const SESSION_PHASES = ["QUESTION", "EXAM_READY"] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];
export const SessionPhaseSchema = z.enum(SESSION_PHASES);

export const JUNIOR_LEVELS = ["EASY", "HARD"] as const;
export type JuniorLevel = (typeof JUNIOR_LEVELS)[number];
export const JuniorLevelSchema = z.enum(JUNIOR_LEVELS);

export const MESSAGE_ROLES = ["USER", "JUNIOR"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];
export const MESSAGE_STAGES = ["QUESTION", "ANSWER", "REACTION", "DOUBT"] as const;
export type MessageStage = (typeof MESSAGE_STAGES)[number];

export const EXAM_STATUSES = ["READY", "IN_PROGRESS", "EVALUATING", "GRADED"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const RECALL_LEVELS = ["STRONG", "FAINT", "NONE"] as const;
export type RecallLevel = (typeof RECALL_LEVELS)[number];

export const GRADE_VERDICTS = ["CORRECT", "PARTIAL", "WRONG"] as const;
export type GradeVerdict = (typeof GRADE_VERDICTS)[number];

export const FINAL_VERDICTS = ["NEEDS_WORK", "MOSTLY", "STABLE"] as const;
export type FinalVerdict = (typeof FINAL_VERDICTS)[number];

export const GAP_STATUSES = ["FOUND", "REVIEWED"] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

export const MATERIAL_STATUSES = ["PENDING", "READY", "FAILED"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const SOURCE_KINDS = ["MD", "TXT", "PDF"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const API_ERROR_CODES = [
  "NOT_FOUND", "INVALID_STATE", "UNAUTHORIZED", "VALIDATION", "LLM_FAILED", "NO_EXPLANATION",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/* ───────── 공통 ───────── */
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

/** §5-3 stageLabel 매핑 */
export const STAGE_LABELS: Record<SessionStatus, string> = {
  PREPARING: "준비 중",
  EXPLAINING: "가르치는 중",
  EXAM_IN_PROGRESS: "시험 중",
  EVALUATING: "채점 중",
  RESULT_READY: "되짚기",
  REVIEWING: "되짚기",
  COMPLETED: "완료",
  FAILED: "실패",
};
export function stageLabelFor(status: SessionStatus): string {
  return STAGE_LABELS[status];
}

/* ───────── §5-2 인증 ───────── */
export const DemoAccountSchema = z.object({ userId: z.string(), nickname: z.string() });
export type DemoAccountDto = z.infer<typeof DemoAccountSchema>;

export const MeSchema = z.object({ userId: z.string(), nickname: z.string(), streakDays: z.number().int() });
export type MeDto = z.infer<typeof MeSchema>;

/* ───────── §5-3 홈 ───────── */
export const HomeResumeSchema = z.object({
  sessionId: z.string(),
  chapterTitle: z.string(),
  status: SessionStatusSchema,
  stageLabel: z.string(),
});
export type HomeResumeDto = z.infer<typeof HomeResumeSchema>;

export const HomeMaterialSchema = z.object({
  materialId: z.string(),
  title: z.string(),
  chapterCount: z.number().int(),
  taughtCount: z.number().int(),
  resume: HomeResumeSchema.nullable(),
});
export type HomeMaterialDto = z.infer<typeof HomeMaterialSchema>;

export const HomeCourseSchema = z.object({
  courseName: z.string(),
  examDate: z.string().nullable(),
  dDay: z.number().int().nullable(),
  materials: z.array(HomeMaterialSchema),
});
export type HomeCourseDto = z.infer<typeof HomeCourseSchema>;

export const RecentSessionSchema = z.object({
  sessionId: z.string(),
  chapterTitle: z.string(),
  materialTitle: z.string(),
  status: SessionStatusSchema,
  score: z.number().int().nullable(),
  finalVerdict: z.enum(FINAL_VERDICTS).nullable(),
  updatedAt: z.string(),
});
export type RecentSessionDto = z.infer<typeof RecentSessionSchema>;

export const HomeSchema = z.object({
  userName: z.string(),
  courses: z.array(HomeCourseSchema),
  recentSessions: z.array(RecentSessionSchema),
  stats: z.object({
    completedSessions: z.number().int(),
    averageScore: z.number().nullable(),
    streakDays: z.number().int(),
  }),
});
export type HomeDto = z.infer<typeof HomeSchema>;

/* ───────── §5-4 자료 ───────── */
export const SourceSchema = z.object({
  sourceId: z.string(),
  kind: z.enum(SOURCE_KINDS),
  fileName: z.string(),
  charCount: z.number().int(),
});
export type SourceDto = z.infer<typeof SourceSchema>;

export const SourceContentSchema = z.object({ sourceId: z.string(), fileName: z.string(), text: z.string() });
export type SourceContentDto = z.infer<typeof SourceContentSchema>;

export const ChapterActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("START") }),
  z.object({ kind: z.literal("CONTINUE"), sessionId: z.string(), status: SessionStatusSchema }),
  z.object({ kind: z.literal("RETRY") }),
]);
export type ChapterAction = z.infer<typeof ChapterActionSchema>;

export const ChapterSchema = z.object({
  chapterId: z.string(),
  order: z.number().int(),
  title: z.string(),
  points: z.array(z.string()),
  sourceId: z.string(),
  startOffset: z.number().int(),
  endOffset: z.number().int(),
  action: ChapterActionSchema,
  taughtAt: z.string().nullable(),
  stableAt: z.string().nullable(),
  bestScore: z.number().int().nullable(),
  openGapCount: z.number().int(),
});
export type ChapterDto = z.infer<typeof ChapterSchema>;

export const MaterialCreateResponseSchema = z.object({
  materialId: z.string(),
  status: z.enum(MATERIAL_STATUSES),
  sources: z.array(SourceSchema),
});
export type MaterialCreateResponse = z.infer<typeof MaterialCreateResponseSchema>;

export const MaterialListItemSchema = z.object({
  materialId: z.string(),
  title: z.string(),
  courseName: z.string(),
  examDate: z.string().nullable(),
  status: z.enum(MATERIAL_STATUSES),
  chapterCount: z.number().int(),
  taughtCount: z.number().int(),
  createdAt: z.string(),
});
export type MaterialListItemDto = z.infer<typeof MaterialListItemSchema>;

export const MaterialSchema = z.object({
  materialId: z.string(),
  title: z.string(),
  courseName: z.string(),
  examDate: z.string().nullable(),
  status: z.enum(MATERIAL_STATUSES),
  error: z.string().nullable().optional(),
  sources: z.array(SourceSchema),
  chapters: z.array(ChapterSchema),
});
export type MaterialDto = z.infer<typeof MaterialSchema>;

/* ───────── §5-5 세션 ───────── */
export const ObjectiveSchema = z.object({ id: z.string(), text: z.string() });
export type ObjectiveDto = z.infer<typeof ObjectiveSchema>;

export const MessageSchema = z.object({
  messageId: z.string(),
  role: z.enum(MESSAGE_ROLES),
  stage: z.enum(MESSAGE_STAGES),
  content: z.string(),
  createdAt: z.string(),
});
export type MessageDto = z.infer<typeof MessageSchema>;

/** rubric 은 절대 내려주지 않는다 */
export const ExamQuestionSchema = z.object({
  qid: z.string(),
  order: z.number().int(),
  points: z.number().int(),
  question: z.string(),
  objectiveRef: z.string(),  /** [게임 확장 additive] 객관식 보기 4개 (OBJECTIVE 시험만) */
  choices: z.array(z.string()).optional(),
});
export type ExamQuestionDto = z.infer<typeof ExamQuestionSchema>;

export const ExamAnswerBriefSchema = z.object({ qid: z.string(), answer: z.string() });
export type ExamAnswerBriefDto = z.infer<typeof ExamAnswerBriefSchema>;

export const ExamSchema = z.object({
  examId: z.string(),
  status: z.enum(EXAM_STATUSES),
  questions: z.array(ExamQuestionSchema),
  answers: z.array(ExamAnswerBriefSchema),
});
export type ExamDto = z.infer<typeof ExamSchema>;

export const SessionChapterSchema = z.object({
  chapterId: z.string(),
  order: z.number().int(),
  title: z.string(),
  points: z.array(z.string()),
});
export const SessionMaterialSchema = z.object({
  materialId: z.string(),
  title: z.string(),
  courseName: z.string(),
});

/** §5-5-1 세션 객체 */
export const SessionSchema = z.object({
  sessionId: z.string(),
  status: SessionStatusSchema,
  phase: SessionPhaseSchema,
  juniorLevel: JuniorLevelSchema,
  chapter: SessionChapterSchema,
  material: SessionMaterialSchema,
  objectives: z.array(ObjectiveSchema),
  messages: z.array(MessageSchema),
  heardConcepts: z.array(z.string()),
  exam: ExamSchema.nullable(),
  score: z.number().int().nullable(),
  finalVerdict: z.enum(FINAL_VERDICTS).nullable(),
  gapCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SessionDto = z.infer<typeof SessionSchema>;

export const SessionListItemSchema = z.object({
  sessionId: z.string(),
  chapterTitle: z.string(),
  materialTitle: z.string(),
  courseName: z.string(),
  status: SessionStatusSchema,
  stageLabel: z.string(),
  score: z.number().int().nullable(),
  finalVerdict: z.enum(FINAL_VERDICTS).nullable(),
  updatedAt: z.string(),
});
export type SessionListItemDto = z.infer<typeof SessionListItemSchema>;

export const CreateSessionRequestSchema = z.object({
  chapterId: z.string(),
  juniorLevel: JuniorLevelSchema.optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export const CreateSessionResponseSchema = z.object({ sessionId: z.string() });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

export const PatchSessionRequestSchema = z.object({ juniorLevel: JuniorLevelSchema });
export type PatchSessionRequest = z.infer<typeof PatchSessionRequestSchema>;

export const FinishExplanationResponseSchema = z.object({
  status: z.literal("EXPLAINING"),
  phase: z.literal("EXAM_READY"),
});
export type FinishExplanationResponse = z.infer<typeof FinishExplanationResponseSchema>;

export const StartExamResponseSchema = z.object({
  status: z.literal("EXAM_IN_PROGRESS"),
  exam: z.object({ examId: z.string(), questions: z.array(ExamQuestionSchema) }),
});
export type StartExamResponse = z.infer<typeof StartExamResponseSchema>;

export const ExplanationRequestSchema = z.object({ content: z.string().min(1).max(2000) });
export type ExplanationRequest = z.infer<typeof ExplanationRequestSchema>;

export const ExamAnswerRequestSchema = z.object({ qid: z.string() });
export type ExamAnswerRequest = z.infer<typeof ExamAnswerRequestSchema>;

export const TutorRequestSchema = z.object({ gapId: z.string(), content: z.string().max(2000).optional() });
export type TutorRequest = z.infer<typeof TutorRequestSchema>;
/** content 없을 때 서버가 쓰는 프리셋 요청 문구 */
export const TUTOR_PRESET_REQUEST = "이 부분을 자료 기준으로 쉽게 설명해줘";

/* ───────── §5-5-2 결과 객체 ───────── */
export const AnswerSentenceSchema = z.object({
  sentence: z.string(),
  ref: z.number().int().nullable(),
  level: z.enum(RECALL_LEVELS),
  unlearned: z.boolean(),
});
export type AnswerSentenceDto = z.infer<typeof AnswerSentenceSchema>;

export const GradeSchema = z.object({
  score: z.number().int(),
  maxScore: z.number().int(),
  verdict: z.enum(GRADE_VERDICTS),
  comment: z.string(),
});
export type GradeDto = z.infer<typeof GradeSchema>;

export const ResultItemSchema = z.object({
  qid: z.string(),
  order: z.number().int(),
  points: z.number().int(),
  question: z.string(),
  answer: z.string(),
  sentences: z.array(AnswerSentenceSchema),
  grade: GradeSchema,
  /** [게임 확장 additive] 객관식 보기 4개 (OBJECTIVE 시험만) */
  choices: z.array(z.string()).optional(),
});
export type ResultItemDto = z.infer<typeof ResultItemSchema>;

export const TutorMessageSchema = z.object({
  id: z.string(),
  request: z.string(),
  response: z.string(),
  createdAt: z.string(),
});
export type TutorMessageDto = z.infer<typeof TutorMessageSchema>;

export const GapSchema = z.object({
  gapId: z.string(),
  qid: z.string(),
  title: z.string(),
  diagnosis: z.string(),
  evidenceQuote: z.string(),
  concepts: z.array(z.string()),
  sourceExcerpt: z.string(),
  status: z.enum(GAP_STATUSES),
  tutorMessages: z.array(TutorMessageSchema),
});
export type GapDto = z.infer<typeof GapSchema>;

export const ResultSchema = z.object({
  sessionId: z.string(),
  status: SessionStatusSchema,
  totalScore: z.number().int(),
  questionCount: z.number().int(),
  correctCount: z.number().int(),
  partialCount: z.number().int(),
  wrongCount: z.number().int(),
  finalVerdict: z.enum(FINAL_VERDICTS),
  items: z.array(ResultItemSchema),
  gaps: z.array(GapSchema),
  chapter: z.object({
    chapterId: z.string(),
    title: z.string(),
    taughtAt: z.string().nullable(),
    stableAt: z.string().nullable(),
  }),
});
export type ResultDto = z.infer<typeof ResultSchema>;

export const ReviewedResponseSchema = z.object({
  gapId: z.string(),
  status: z.literal("REVIEWED"),
  remaining: z.number().int(),
});
export type ReviewedResponse = z.infer<typeof ReviewedResponseSchema>;

export const CompleteResponseSchema = z.object({
  status: z.literal("COMPLETED"),
  score: z.number().int().nullable(),
  finalVerdict: z.enum(FINAL_VERDICTS).nullable(),
  openGapCount: z.number().int(),
  chapter: z.object({ taughtAt: z.string().nullable(), stableAt: z.string().nullable() }),
});
export type CompleteResponse = z.infer<typeof CompleteResponseSchema>;

export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;

/** §4 finalVerdict 규칙 */
export function finalVerdictFor(totalScore: number, gapCount: number): FinalVerdict {
  if (totalScore >= 90 && gapCount === 0) return "STABLE";
  if (totalScore >= 70) return "MOSTLY";
  return "NEEDS_WORK";
}
