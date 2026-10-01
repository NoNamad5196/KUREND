import type {
  AnswerSentenceDto, ExamQuestionDto, ExamStatus, FinalVerdict, GapDto,
  GradeDto, JuniorLevel, MaterialStatus, MessageDto, ObjectiveDto,
  SessionDto, SessionPhase, SessionStatus, SourceKind,
} from "@/contracts/types";
import type { SessionGameSnapshot } from "@/contracts/game";
import type { ErrorDetails } from "@/contracts/errors";

export class RouteError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 409 | 502,
    public readonly code: "VALIDATION" | "UNAUTHORIZED" | "NOT_FOUND" | "INVALID_STATE" | "LLM_FAILED",
    message: string,
    public readonly details: ErrorDetails = {},
  ) {
    super(message);
    this.name = "RouteError";
  }
}

export interface SourceRecord {
  sourceId: string;
  kind: SourceKind;
  fileName: string;
  text: string;
  charCount: number;
}

export interface ChapterRecord {
  chapterId: string;
  order: number;
  title: string;
  points: string[];
  sourceId: string;
  startOffset: number;
  endOffset: number;
  taughtAt: string | null;
  stableAt: string | null;
}

export interface MaterialRecord {
  materialId: string;
  userId: string;
  revision: number;
  title: string;
  courseName: string;
  status: MaterialStatus;
  error: string | null;
  sources: SourceRecord[];
  chapters: ChapterRecord[];
}

export interface MessageRecord extends MessageDto {
  excluded: boolean;
}

export interface AnswerRecord {
  qid: string;
  answer: string;
  sentences: AnswerSentenceDto[];
}

export interface ExamRecord {
  examId: string;
  status: ExamStatus;
  questions: (ExamQuestionDto & { rubric: string })[];
  answers: AnswerRecord[];
  grades: (GradeDto & { qid: string })[];
}

export interface SessionRecord {
  game?: SessionGameSnapshot;
  sessionId: string;
  userId: string;
  revision: number;
  status: SessionStatus;
  phase: SessionPhase;
  juniorLevel: JuniorLevel;
  chapter: ChapterRecord & { text: string };
  material: { materialId: string; title: string; courseName: string };
  objectives: ObjectiveDto[];
  heardConcepts: string[];
  messages: MessageRecord[];
  exam: ExamRecord | null;
  gaps: (GapDto & { sourceOffset?: number | null })[];
  score: number | null;
  finalVerdict: FinalVerdict | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The only C integration boundary. TODO(C): supply an implementation using
 * requireUser, db.$transaction, and toSessionDto from lib/server. JSON database
 * columns are decoded by the adapter; chapter.text is the source offset slice.
 * Never write C-owned files just to satisfy these imports before C is merged.
 *
 * Reads MUST filter by owner. Commits MUST atomically compare previous.revision
 * and ownership, replace the modified aggregate, and return a fresh snapshot
 * with a higher revision. Reject stale writes with INVALID_STATE (409), and
 * missing/deleted aggregates with NOT_FOUND (404). Do not hold a SQL transaction
 * across an LLM request. A persistent adapter must coordinate other C mutations
 * with the same revision token (updatedAt can back that token).
 */
export interface RouteBackend {
  requireUser(request: Request): Promise<{ id: string }>;
  getMaterial(materialId: string, userId: string): Promise<MaterialRecord | null>;
  getSession(sessionId: string, userId: string): Promise<SessionRecord | null>;
  commitMaterial(previous: MaterialRecord, next: MaterialRecord): Promise<MaterialRecord>;
  commitSession(previous: SessionRecord, next: SessionRecord): Promise<SessionRecord>;
  toSessionDto(session: SessionRecord): SessionDto;
}

const backendSymbol = Symbol.for("teachback.d.route-backend");
type BackendGlobal = typeof globalThis & { [backendSymbol]?: RouteBackend };

/** C's bootstrap installs its adapter here; tests can inject one per factory. */
export function installRouteBackend(backend: RouteBackend): void {
  (globalThis as BackendGlobal)[backendSymbol] = backend;
}

export async function getRouteBackend(): Promise<RouteBackend> {
  const installed = (globalThis as BackendGlobal)[backendSymbol];
  if (installed) return installed;
  // The in-memory demo must never silently replace authentication/persistence.
  if (process.env.D_STUB_BACKEND === "1" && process.env.LLM_PROVIDER === "stub") {
    const { getStubBackend } = await import("./backend-stub");
    return getStubBackend();
  }
  throw new RouteError(502, "LLM_FAILED", "C의 인증·DB 어댑터가 아직 연결되지 않았습니다.");
}
