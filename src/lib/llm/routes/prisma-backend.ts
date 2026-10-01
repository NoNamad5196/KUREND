/**
 * D's adapter for C's frozen Prisma schema. This file deliberately imports no
 * generated Prisma client: C passes its existing singleton and auth helper.
 */
import { SessionSchema, type SessionDto } from "@/contracts/types";
import { CHARACTERS, FINAL_QUESTION_COUNT, type ExamFormat, type JuniorCharacter, type SessionGameSnapshot } from "@/contracts/game";
import {
  RouteError, type ChapterRecord, type MaterialRecord, type RouteBackend,
  type SessionRecord, type SourceRecord,
} from "./backend";

type DateValue = Date | string;
type JsonArgs = Record<string, unknown>;
interface Delegate<T> {
  findFirst(args: JsonArgs): Promise<T | null>;
  updateMany(args: JsonArgs): Promise<{ count: number }>;
  upsert(args: JsonArgs): Promise<unknown>;
  deleteMany(args: JsonArgs): Promise<unknown>;
}
interface DbSource extends Omit<SourceRecord, "sourceId"> { id: string }
interface DbChapter extends Omit<ChapterRecord, "chapterId" | "points" | "taughtAt" | "stableAt"> {
  id: string;
  pointsJson: string;
  taughtAt: DateValue | null;
  stableAt: DateValue | null;
}
interface DbMaterial {
  id: string;
  userId: string;
  title: string;
  courseName: string;
  status: MaterialRecord["status"];
  error: string | null;
  sources: DbSource[];
  chapters: DbChapter[];
}
interface DbMessage {
  id: string;
  role: SessionRecord["messages"][number]["role"];
  stage: SessionRecord["messages"][number]["stage"];
  content: string;
  excluded: boolean;
  createdAt: DateValue;
}
interface DbExam {
  id: string;
  status: NonNullable<SessionRecord["exam"]>["status"];
  questions: (NonNullable<SessionRecord["exam"]>["questions"][number] & { choicesJson?: string | null })[];
  answers: { qid: string; answer: string; sentencesJson: string }[];
  grades: NonNullable<SessionRecord["exam"]>["grades"];
}
interface DbGap extends Omit<SessionRecord["gaps"][number], "gapId" | "concepts" | "tutorMessages"> {
  id: string;
  conceptsJson: string;
  tutorMessages: { id: string; request: string; response: string; createdAt: DateValue }[];
}
export interface PrismaSessionAggregate {
  id: string;
  userId: string;
  status: SessionRecord["status"];
  phase: SessionRecord["phase"];
  juniorLevel: SessionRecord["juniorLevel"];
  objectivesJson: string;
  heardJson: string;
  score: number | null;
  finalVerdict: SessionRecord["finalVerdict"];
  error: string | null;
  createdAt: DateValue;
  updatedAt: DateValue;
  chapter: DbChapter & { source: DbSource; material: DbMaterial };
  messages: DbMessage[];
  exam: DbExam | null;
  gaps: DbGap[];
  /** [① 게임 확장] 연결된 Run (없으면 연습 모드). 스냅샷 비교 대상인 스칼라라 값이 바뀌지 않는다. */
  runId?: string | null;
  character?: string | null;
  replacementSessionId?: string | null;
  /** [① 게임 확장 P1] 오답노트 "다시 가르치기" 집중 개념 string[] JSON */
  focusConceptsJson?: string | null;
  /** [① 게임 확장] CHAPTER | FINAL(졸업시험: 자료 전체 범위 · 10문항 혼합) */
  kind?: string | null;
}

/** 다시 가르치기 세션이면 집중 개념을 챕터 포인트 앞에 둔다(준비 단계가 points 로 학습 목표·문항을 만든다). 최대 3개 유지 */
function focusedPoints(points: string[], focusJson: string | null | undefined): string[] {
  if (!focusJson) return points;
  let focus: string[] = [];
  try {
    const parsed: unknown = JSON.parse(focusJson);
    if (Array.isArray(parsed)) focus = parsed.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim());
  } catch {
    return points;
  }
  if (!focus.length) return points;
  const rest = points.filter((p) => !focus.includes(p));
  return [...focus, ...rest].slice(0, Math.max(3, Math.min(focus.length, 4)));
}
/** [① 게임 확장] Run·숙련도 조회용. 세션 aggregate 비교(CAS)에 넣지 않아 같은 Run 의 다른 세션 LIFE 변화로 409 가 나지 않는다. */
interface DbRun { id: string; character: string; lives: number; maxLives: number }
interface DbMastery { concept: string; exposureCount: number; mastery: number }
interface GameDelegates {
  juniorRun?: { findUnique(args: JsonArgs): Promise<DbRun | null> };
  conceptMastery?: { findMany(args: JsonArgs): Promise<DbMastery[]>; upsert(args: JsonArgs): Promise<unknown> };
}
/** ② 가 SessionRecord.game? 을 선언하기 전에도 같은 모양으로 붙여 둔다. */
type SessionRecordWithGame = SessionRecord & { game?: SessionGameSnapshot };

/** 졸업시험 본문 상한(LLM 프롬프트 크기 보호) */
const FINAL_TEXT_LIMIT = 16_000;

/**
 * [① 게임 확장] 졸업시험(FINAL) 세션은 자료 전체를 한 범위로 본다.
 * 제목 "<자료> 졸업시험", 포인트 = 챕터 제목들, 본문 = 모든 원문(상한 FINAL_TEXT_LIMIT). DB 행은 바꾸지 않는다(레코드만).
 */
async function applyFinalScope(db: { material: Delegate<DbMaterial> }, raw: PrismaSessionAggregate, record: SessionRecord): Promise<void> {
  if (raw.kind !== "FINAL") return;
  const material = await db.material.findFirst({ where: { id: raw.chapter.material.id }, include: materialInclude });
  if (!material) return;
  const first = material.sources[0];
  const text = material.sources.map((source) => source.text).join("\n\n").slice(0, FINAL_TEXT_LIMIT);
  if (!first || !text.trim()) return;
  const titles = material.chapters.map((item) => item.title).filter((title) => title.trim());
  record.chapter = {
    ...record.chapter,
    title: `${material.title} 졸업시험`.slice(0, 40),
    points: titles.length ? titles : record.chapter.points,
    sourceId: first.id,
    startOffset: 0,
    endOffset: Math.min(first.text.length, text.length),
    text,
  };
}

async function loadGameSnapshot(db: GameDelegates, runId: string | null | undefined, chapterId: string, kind?: string | null, selectedCharacter?: string | null): Promise<SessionGameSnapshot | undefined> {
  if (!runId || !db.juniorRun) return undefined;
  const run = await db.juniorRun.findUnique({ where: { id: runId }, select: { id: true, character: true, lives: true, maxLives: true } });
  if (!run || !((selectedCharacter ?? run.character) in CHARACTERS)) {
    throw new RouteError(409, "INVALID_STATE", "후배 설정을 불러오지 못했습니다. 자료 화면에서 후배를 다시 선택해 주세요.", { reason: "CHARACTER_CONFIG_NOT_FOUND" });
  }
  const character = (selectedCharacter ?? run.character) as JuniorCharacter;
  const mastery = db.conceptMastery
    ? await db.conceptMastery.findMany({ where: { runId, chapterId }, orderBy: { concept: "asc" }, select: { concept: true, exposureCount: true, mastery: true } })
    : [];
  return {
    runId: run.id, character, lives: run.lives, maxLives: run.maxLives,
    passScore: CHARACTERS[character].passScore,
    examFormat: kind === "FINAL" ? "MIXED" : CHARACTERS[character].examFormat,
    questionCount: kind === "FINAL" ? FINAL_QUESTION_COUNT : CHARACTERS[character].questionCount,
    kind: kind === "FINAL" ? "FINAL" : "CHAPTER",
    mastery,
  };
}
interface PrismaTransaction extends GameDelegates {
  material: Delegate<DbMaterial>;
  session: Delegate<PrismaSessionAggregate>;
  chapter: Delegate<DbChapter>;
  message: Delegate<DbMessage>;
  exam: Delegate<DbExam>;
  examQuestion: Delegate<unknown>;
  examAnswer: Delegate<unknown>;
  grade: Delegate<unknown>;
  gap: Delegate<DbGap>;
  tutorMessage: Delegate<unknown>;
}
interface PrismaConnection extends PrismaTransaction {
  $transaction<T>(work: (transaction: PrismaTransaction) => Promise<T>): Promise<T>;
}

export interface PrismaBackendOptions<RawSession = PrismaSessionAggregate> {
  /** C's generated PrismaClient singleton. Kept structural to avoid generating C's schema. */
  db: unknown;
  requireUser(request: Request): Promise<{ id: string } | { userId: string }>;
  /** Optional C serializer, called with the included raw Prisma aggregate. */
  toSessionDto?: (session: RawSession) => SessionDto;
}

const materialInclude = {
  sources: { orderBy: { id: "asc" } },
  chapters: { orderBy: [{ order: "asc" }, { id: "asc" }] },
};
const sessionInclude = {
  chapter: { include: { source: true, material: true } },
  messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  exam: { include: {
    questions: { orderBy: [{ order: "asc" }, { id: "asc" }] },
    answers: { orderBy: { qid: "asc" } },
    grades: { orderBy: { qid: "asc" } },
  } },
  gaps: { orderBy: { id: "asc" }, include: {
    tutorMessages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  } },
};

function iso(value: DateValue): string { return new Date(value).toISOString(); }
function nullableIso(value: DateValue | null): string | null { return value === null ? null : iso(value); }
function json<T>(value: string): T { return JSON.parse(value) as T; }
function chapter(row: DbChapter): ChapterRecord {
  return {
    chapterId: row.id, order: row.order, title: row.title,
    points: json<string[]>(row.pointsJson), sourceId: row.sourceId,
    startOffset: row.startOffset, endOffset: row.endOffset,
    taughtAt: nullableIso(row.taughtAt), stableAt: nullableIso(row.stableAt),
  };
}

/** Whitelist public fields; neither source text, rubrics nor excluded messages escape. */
export function normalizedSessionDto(session: SessionRecord): SessionDto {
  return SessionSchema.parse({
    sessionId: session.sessionId, status: session.status, phase: session.phase,
    character: session.game?.character ?? null,
    juniorLevel: session.juniorLevel, chapter: session.chapter, material: session.material,
    objectives: session.objectives,
    messages: session.messages.filter((message) => !message.excluded),
    heardConcepts: session.heardConcepts, exam: session.exam,
    score: session.score, finalVerdict: session.finalVerdict,
    gapCount: session.gaps.length, createdAt: session.createdAt, updatedAt: session.updatedAt,
  });
}

function conflict(): never {
  throw new RouteError(409, "INVALID_STATE", "다른 요청이 먼저 데이터를 변경했습니다. 새로고침 후 다시 시도해 주세요.");
}
function missing(): never { throw new RouteError(404, "NOT_FOUND", "자료 또는 세션을 찾을 수 없습니다."); }

function assertCurrentConversation(session: PrismaSessionAggregate): void {
  if (session.replacementSessionId) throw new RouteError(409, "INVALID_STATE", "선택한 후배의 학습 세션을 다시 불러오고 있어요.", {
    reason: "CHAT_SESSION_INVALID", replacementSessionId: session.replacementSessionId, materialId: session.chapter.material.id,
  });
}

/** No transaction is held while an LLM call is in progress. */
export function createPrismaBackend<RawSession = PrismaSessionAggregate>(
  options: PrismaBackendOptions<RawSession>,
): RouteBackend {
  const db = options.db as PrismaConnection;
  if (!db || typeof db.$transaction !== "function" || !db.material || !db.session) {
    throw new Error("createPrismaBackend requires C's generated Prisma client.");
  }
  // Per-object snapshots are GC-able, never an unbounded session/revision cache.
  const materialSnapshots = new WeakMap<MaterialRecord, DbMaterial>();
  const sessionSnapshots = new WeakMap<SessionRecord, PrismaSessionAggregate>();
  let revision = 0;
  function materialRecord(raw: DbMaterial): MaterialRecord {
    const result: MaterialRecord = {
      materialId: raw.id, userId: raw.userId, revision: ++revision,
      title: raw.title, courseName: raw.courseName, status: raw.status, error: raw.error,
      sources: raw.sources.map((source) => ({
        sourceId: source.id, kind: source.kind, fileName: source.fileName,
        text: source.text, charCount: source.charCount,
      })),
      chapters: raw.chapters.map(chapter),
    };
    materialSnapshots.set(result, structuredClone(raw));
    return result;
  }
  function sessionRecord(raw: PrismaSessionAggregate): SessionRecord {
    const result: SessionRecord = {
      sessionId: raw.id, userId: raw.userId, revision: ++revision,
      status: raw.status, phase: raw.phase, juniorLevel: raw.juniorLevel,
      chapter: {
        ...chapter(raw.chapter),
        points: focusedPoints(chapter(raw.chapter).points, raw.focusConceptsJson),
        text: raw.chapter.source.text.slice(raw.chapter.startOffset, raw.chapter.endOffset),
      },
      material: { materialId: raw.chapter.material.id, title: raw.chapter.material.title, courseName: raw.chapter.material.courseName },
      objectives: json(raw.objectivesJson), heardConcepts: json(raw.heardJson),
      messages: raw.messages.map((message) => ({
        messageId: message.id, role: message.role, stage: message.stage,
        content: message.content, excluded: message.excluded, createdAt: iso(message.createdAt),
      })),
      exam: raw.exam && {
        examId: raw.exam.id, status: raw.exam.status,
        questions: raw.exam.questions.map(({ qid, order, points, question, objectiveRef, rubric, choicesJson }) => ({
          qid, order, points, question, objectiveRef, rubric,
          ...(choicesJson ? { choices: json<string[]>(choicesJson) } : {}),
        })),
        answers: raw.exam.answers.map((answer) => ({ qid: answer.qid, answer: answer.answer, sentences: json(answer.sentencesJson) })),
        grades: raw.exam.grades.map(({ qid, score, maxScore, verdict, comment }) => ({ qid, score, maxScore, verdict, comment })),
      },
      gaps: raw.gaps.map((gap) => ({
        gapId: gap.id, qid: gap.qid, title: gap.title, diagnosis: gap.diagnosis,
        evidenceQuote: gap.evidenceQuote, concepts: json(gap.conceptsJson),
        sourceExcerpt: gap.sourceExcerpt, sourceOffset: gap.sourceOffset, status: gap.status,
        tutorMessages: gap.tutorMessages.map((message) => ({ id: message.id, request: message.request, response: message.response, createdAt: iso(message.createdAt) })),
      })),
      score: raw.score, finalVerdict: raw.finalVerdict, error: raw.error,
      createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt),
    };
    sessionSnapshots.set(result, structuredClone(raw));
    return result;
  }
  async function transact<T>(operation: (tx: PrismaTransaction) => Promise<T>): Promise<T> {
    try { return await db.$transaction(operation); }
    catch (error) {
      // Prisma uses P2034 for transaction conflicts; SQLite may surface a busy
      // timeout as P1008. A retry must rerun the route against a fresh snapshot.
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "P2034" || code === "P2002" || code === "P1008") conflict();
      if (code === "P2025") missing();
      throw error;
    }
  }
  return {
    async requireUser(request) {
      const user = await options.requireUser(request);
      const id = "id" in user ? user.id : user.userId;
      if (!id) throw new RouteError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
      return { id };
    },
    async getMaterial(materialId, userId) {
      const raw = await db.material.findFirst({ where: { id: materialId, userId }, include: materialInclude });
      return raw ? materialRecord(raw) : null;
    },
    async getSession(sessionId, userId) {
      const raw = await db.session.findFirst({ where: { id: sessionId, userId }, include: sessionInclude });
      if (!raw) return null;
      assertCurrentConversation(raw);
      const record: SessionRecordWithGame = sessionRecord(raw);
      await applyFinalScope(db, raw, record);
      const game = await loadGameSnapshot(db, raw.runId, raw.chapter.id, raw.kind, raw.character);
      if (game) record.game = game;
      return record;
    },
    async commitMaterial(previous, next) {
      const snapshot = materialSnapshots.get(previous);
      if (!snapshot || next.materialId !== previous.materialId || next.userId !== previous.userId) conflict();
      return transact(async (tx) => {
        const current = await tx.material.findFirst({ where: { id: previous.materialId, userId: previous.userId }, include: materialInclude });
        if (!current) missing();
        if (JSON.stringify(current) !== JSON.stringify(snapshot)) conflict();
        const changed = await tx.material.updateMany({
          where: { id: previous.materialId, userId: previous.userId, status: current.status, title: current.title, error: current.error },
          data: { title: next.title, status: next.status, error: next.error },
        });
        if (changed.count !== 1) conflict();
        // A regeneration must never cascade-delete C's existing sessions.
        const removed = current.chapters.filter((item) => !next.chapters.some((candidate) => candidate.chapterId === item.id));
        if (removed.length) conflict();
        for (const item of next.chapters) {
          const data = {
            materialId: next.materialId, order: item.order, title: item.title,
            pointsJson: JSON.stringify(item.points), sourceId: item.sourceId,
            startOffset: item.startOffset, endOffset: item.endOffset,
          };
          await tx.chapter.upsert({ where: { id: item.chapterId }, create: { id: item.chapterId, ...data }, update: data });
        }
        const fresh = await tx.material.findFirst({ where: { id: next.materialId, userId: next.userId }, include: materialInclude });
        if (!fresh) missing();
        return materialRecord(fresh);
      });
    },
    async commitSession(previous, next) {
      const snapshot = sessionSnapshots.get(previous);
      if (!snapshot || next.sessionId !== previous.sessionId || next.userId !== previous.userId) conflict();
      return transact(async (tx) => {
        const current = await tx.session.findFirst({ where: { id: previous.sessionId, userId: previous.userId }, include: sessionInclude });
        if (!current) missing();
        assertCurrentConversation(current);
        if (JSON.stringify(current) !== JSON.stringify(snapshot)) conflict();
        const updatedAt = new Date(Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1));
        const changed = await tx.session.updateMany({
          where: { id: previous.sessionId, userId: previous.userId, updatedAt: new Date(current.updatedAt) },
          data: { status: next.status, phase: next.phase, juniorLevel: next.juniorLevel,
            objectivesJson: JSON.stringify(next.objectives), heardJson: JSON.stringify(next.heardConcepts),
            score: next.score, finalVerdict: next.finalVerdict, error: next.error, updatedAt },
        });
        if (changed.count !== 1) conflict();
        await persistSessionChildren(tx, current, next);
        await persistMastery(tx, current, next);
        const fresh = await tx.session.findFirst({ where: { id: next.sessionId, userId: next.userId }, include: sessionInclude });
        if (!fresh) missing();
        const record: SessionRecordWithGame = sessionRecord(fresh);
        await applyFinalScope(tx, fresh, record);
        const game = await loadGameSnapshot(tx, fresh.runId, fresh.chapter.id, fresh.kind, fresh.character);
        if (game) record.game = game;
        return record;
      });
    },
    toSessionDto(session) {
      const raw = sessionSnapshots.get(session);
      if (options.toSessionDto && raw) return SessionSchema.parse(options.toSessionDto(structuredClone(raw) as RawSession));
      return normalizedSessionDto(session);
    },
  };
}

/** [① 게임 확장 P1] ② 가 next.game.mastery 를 채우면 Run×챕터×개념 숙련도를 upsert 한다. */
async function persistMastery(tx: PrismaTransaction, current: PrismaSessionAggregate, next: SessionRecord): Promise<void> {
  const game = (next as SessionRecordWithGame).game;
  if (!game?.mastery?.length || !current.runId || game.runId !== current.runId || !tx.conceptMastery) return;
  for (const m of game.mastery) {
    const value = Math.max(0, Math.min(100, Math.round(m.mastery)));
    const data = { exposureCount: Math.max(0, Math.round(m.exposureCount)), mastery: value };
    await tx.conceptMastery.upsert({
      where: { runId_chapterId_concept: { runId: current.runId, chapterId: current.chapter.id, concept: m.concept } },
      create: { runId: current.runId, chapterId: current.chapter.id, concept: m.concept, ...data },
      update: data,
    });
  }
}

async function persistSessionChildren(tx: PrismaTransaction, current: PrismaSessionAggregate, next: SessionRecord): Promise<void> {
  // D only appends messages/questions/answers/grades/gaps/tutor replies. Refuse
  // accidental deletion instead of cascading away C-owned history.
  if (current.messages.some((old) => !next.messages.some((item) => item.messageId === old.id))) conflict();
  if (current.gaps.some((old) => !next.gaps.some((item) => item.gapId === old.id))) conflict();
  if (current.exam && (!next.exam || current.exam.id !== next.exam.examId)) conflict();
  const storedMessages = new Map(current.messages.map((message) => [message.id, message]));
  let lastMessageTime = current.messages.reduce(
    (latest, message) => Math.max(latest, new Date(message.createdAt).getTime()),
    Number.NEGATIVE_INFINITY,
  );
  for (const message of next.messages) {
    const stored = storedMessages.get(message.messageId);
    // SQLite stores millisecond timestamps. Multiple streamed messages may be
    // constructed in the same tick, so a createdAt/id sort could otherwise put
    // a QUESTION before its REACTION or change USER reference numbering.
    // Preserve historical timestamps; assign only new rows a strictly later
    // timestamp in the aggregate's append order, inside this CAS transaction.
    const createdAt = stored ? new Date(stored.createdAt) : new Date(
      Math.max(new Date(message.createdAt).getTime(), lastMessageTime + 1),
    );
    if (!stored) lastMessageTime = createdAt.getTime();
    const data = { sessionId: next.sessionId, role: message.role, stage: message.stage,
      content: message.content, excluded: message.excluded, createdAt };
    await tx.message.upsert({ where: { id: message.messageId }, create: { id: message.messageId, ...data }, update: data });
  }
  if (next.exam) {
    const exam = next.exam;
    // [① 게임 확장] 시험 형식은 Run 의 후배가 정한다(연습 모드는 DESCRIPTIVE). 생성 시에만 기록한다.
    const format: ExamFormat = (next as SessionRecordWithGame).game?.examFormat ?? "DESCRIPTIVE";
    await tx.exam.upsert({ where: { id: exam.examId },
      create: { id: exam.examId, sessionId: next.sessionId, status: exam.status, format }, update: { status: exam.status } });
    for (const question of exam.questions) {
      const id = `${exam.examId}:${question.qid}`;
      // [① 게임 확장] 객관식 보기(choices)는 ExamQuestion.choicesJson 컬럼에 저장한다.
      const { choices, ...rest } = question as typeof question & { choices?: string[] };
      const data = { examId: exam.examId, ...rest, choicesJson: choices?.length ? JSON.stringify(choices) : null };
      await tx.examQuestion.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    for (const answer of exam.answers) {
      const id = `${exam.examId}:${answer.qid}`;
      const data = { examId: exam.examId, qid: answer.qid, answer: answer.answer, sentencesJson: JSON.stringify(answer.sentences) };
      await tx.examAnswer.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    for (const grade of exam.grades) {
      const id = `${exam.examId}:${grade.qid}`;
      const data = { examId: exam.examId, ...grade };
      await tx.grade.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
  }
  for (const gap of next.gaps) {
    const data = { sessionId: next.sessionId, qid: gap.qid, title: gap.title, diagnosis: gap.diagnosis,
      evidenceQuote: gap.evidenceQuote, conceptsJson: JSON.stringify(gap.concepts),
      sourceExcerpt: gap.sourceExcerpt, sourceOffset: gap.sourceOffset ?? null, status: gap.status };
    await tx.gap.upsert({ where: { id: gap.gapId }, create: { id: gap.gapId, ...data }, update: data });
    for (const message of gap.tutorMessages) {
      const messageData = { sessionId: next.sessionId, gapId: gap.gapId, request: message.request,
        response: message.response, createdAt: new Date(message.createdAt) };
      await tx.tutorMessage.upsert({ where: { id: message.id }, create: { id: message.id, ...messageData }, update: messageData });
    }
  }
}
