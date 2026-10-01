/**
 * [B] mock 인메모리 스토어 (globalThis 에 보관해 HMR 에도 유지). dev 서버를 재시작하면 fixture 초기값으로 돌아간다.
 * 모든 전이는 §4 상태 머신을 검증하고 위반 시 409 INVALID_STATE.
 */
import { customAlphabet } from "nanoid";
import {
  finalVerdictFor,
  stageLabelFor,
  type AnswerSentenceDto,
  type ChapterAction,
  type CompleteResponse,
  type DemoAccountDto,
  type FinalVerdict,
  type GapDto,
  type GradeDto,
  type HomeDto,
  type JuniorLevel,
  type MaterialDto,
  type MaterialListItemDto,
  type MessageDto,
  type MessageStage,
  type ObjectiveDto,
  type ResultDto,
  type SessionDto,
  type SessionListItemDto,
  type SessionPhase,
  type SessionStatus,
  type SourceContentDto,
  type SourceKind,
  type StartExamResponse,
  type TutorMessageDto,
} from "@/contracts/types";
import { ECON_CHAPTER_RANGES, ECON_PACK, ECON_SOURCE_TEXT } from "./fixtures/econ";
import { OS_CHAPTER_RANGES, OS_SOURCE_TEXT, SESS_DONE } from "./fixtures/os";
import { invalidState, MockError, notFound } from "./http";
import { genericPack, type Pack } from "./pack";

const rid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 14);
export const newId = (prefix: string) => `${prefix}_${rid()}`;
const now = () => new Date().toISOString();

/* ───────── 레코드 ───────── */
export type MsgRec = MessageDto & { excluded: boolean };
export type QuestionRec = { qid: string; order: number; points: number; question: string; objectiveRef: string; rubric: string };
export type ExamRec = {
  examId: string;
  status: "READY" | "IN_PROGRESS" | "EVALUATING" | "GRADED";
  createdAt: string;
  questions: QuestionRec[];
  answers: Record<string, AnswerSentenceDto[]>;
  grades: Record<string, GradeDto>;
};
export type GapRec = Omit<GapDto, "tutorMessages"> & { createdAt: string; tutorMessages: TutorMessageDto[] };
export type SessionRec = {
  sessionId: string;
  userId: string;
  chapterId: string;
  status: SessionStatus;
  phase: SessionPhase;
  juniorLevel: JuniorLevel;
  objectives: ObjectiveDto[];
  heard: string[];
  covered: string[];
  messages: MsgRec[];
  exam: ExamRec | null;
  gaps: GapRec[];
  score: number | null;
  finalVerdict: FinalVerdict | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
export type ChapterRec = {
  chapterId: string;
  materialId: string;
  order: number;
  title: string;
  points: string[];
  sourceId: string;
  startOffset: number;
  endOffset: number;
  taughtAt: string | null;
  stableAt: string | null;
};
export type SourceRec = { sourceId: string; materialId: string; kind: SourceKind; fileName: string; text: string; charCount: number };
export type MaterialRec = {
  materialId: string;
  userId: string;
  courseName: string;
  examDate: string | null;
  title: string;
  status: "PENDING" | "READY" | "FAILED";
  error: string | null;
  createdAt: string;
};
type Store = {
  users: DemoAccountDto[];
  materials: Map<string, MaterialRec>;
  sources: Map<string, SourceRec>;
  chapters: Map<string, ChapterRec>;
  sessions: Map<string, SessionRec>;
  packs: Map<string, Pack>;
};

/* ───────── 시드 ───────── */
function seed(): Store {
  const s: Store = {
    users: [
      { userId: "usr_demo1", nickname: "체험 1" },
      { userId: "usr_demo2", nickname: "체험 2" },
      { userId: "usr_demo3", nickname: "체험 3" },
    ],
    materials: new Map(),
    sources: new Map(),
    chapters: new Map(),
    sessions: new Map(),
    packs: new Map(),
  };
  const mat = (m: MaterialRec, src: Omit<SourceRec, "materialId" | "charCount">, ranges: ReadonlyArray<{ chapterId: string; order: number; title: string; points: readonly string[]; start: number; end: number }>) => {
    s.materials.set(m.materialId, m);
    s.sources.set(src.sourceId, { ...src, materialId: m.materialId, charCount: src.text.length });
    for (const r of ranges) {
      s.chapters.set(r.chapterId, {
        chapterId: r.chapterId,
        materialId: m.materialId,
        order: r.order,
        title: r.title,
        points: [...r.points],
        sourceId: src.sourceId,
        startOffset: r.start,
        endOffset: r.end,
        taughtAt: null,
        stableAt: null,
      });
    }
  };
  mat(
    { materialId: "mat_os", userId: "usr_demo1", courseName: "운영체제", examDate: "2026-10-08", title: "4장 프로세스 스케줄링", status: "READY", error: null, createdAt: "2026-09-28T09:00:00.000Z" },
    { sourceId: "src_os", kind: "MD", fileName: "os-ch4-scheduling.md", text: OS_SOURCE_TEXT },
    OS_CHAPTER_RANGES,
  );
  mat(
    { materialId: "mat_econ", userId: "usr_demo1", courseName: "경제학원론", examDate: "2026-10-13", title: "경제학원론 수요·공급", status: "READY", error: null, createdAt: "2026-09-29T09:00:00.000Z" },
    { sourceId: "src_econ", kind: "MD", fileName: "econ-demand-supply.md", text: ECON_SOURCE_TEXT },
    ECON_CHAPTER_RANGES,
  );
  s.chapters.get("chp_os_1")!.taughtAt = "2026-09-28T11:00:00.000Z";
  s.chapters.get("chp_os_3")!.taughtAt = SESS_DONE.completedAt;

  const d = SESS_DONE;
  s.sessions.set(d.sessionId, {
    sessionId: d.sessionId,
    userId: d.userId,
    chapterId: d.chapterId,
    status: d.status,
    phase: d.phase,
    juniorLevel: d.juniorLevel,
    objectives: d.objectives,
    heard: [...d.heard],
    covered: ["o1", "o2", "o3"],
    messages: d.messages.map((m) => ({ ...m, excluded: false })),
    exam: {
      examId: d.exam.examId,
      status: d.exam.status,
      createdAt: d.exam.createdAt,
      questions: d.exam.questions,
      answers: d.exam.answers,
      grades: d.exam.grades,
    },
    gaps: d.gaps.map((g) => ({ ...g, tutorMessages: [...g.tutorMessages] })),
    score: d.score,
    finalVerdict: d.finalVerdict,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    completedAt: d.completedAt,
  });
  s.sessions.set("sess_demo", blankSession("sess_demo", "usr_demo1", "chp_econ_1", "EASY"));
  return s;
}

function blankSession(sessionId: string, userId: string, chapterId: string, level: JuniorLevel): SessionRec {
  const t = now();
  return {
    sessionId,
    userId,
    chapterId,
    status: "PREPARING",
    phase: "QUESTION",
    juniorLevel: level,
    objectives: [],
    heard: [],
    covered: [],
    messages: [],
    exam: null,
    gaps: [],
    score: null,
    finalVerdict: null,
    createdAt: t,
    updatedAt: t,
    completedAt: null,
  };
}

const G = globalThis as unknown as { __kurendMock?: Store };
export function store(): Store {
  if (!G.__kurendMock) G.__kurendMock = seed();
  return G.__kurendMock;
}
export function resetStore() {
  G.__kurendMock = seed();
}

/* ───────── 조회 헬퍼 ───────── */
export const DEFAULT_USER = "usr_demo1";
export function getUser(userId: string) {
  return store().users.find((u) => u.userId === userId) ?? null;
}
export function getChapter(id: string): ChapterRec {
  const c = store().chapters.get(id);
  if (!c) throw notFound("목차");
  return c;
}
export function getMaterialRec(id: string): MaterialRec {
  const m = store().materials.get(id);
  if (!m) throw notFound("자료");
  return m;
}
export function chapterText(c: ChapterRec): string {
  const src = store().sources.get(c.sourceId);
  return src ? src.text.slice(c.startOffset, c.endOffset) : "";
}
export function packFor(chapterId: string): Pack {
  const st = store();
  const cached = st.packs.get(chapterId);
  if (cached) return cached;
  const c = getChapter(chapterId);
  const p = chapterId === "chp_econ_1" ? ECON_PACK : genericPack(c, chapterText(c));
  st.packs.set(chapterId, p);
  return p;
}

export function getSession(id: string): SessionRec {
  const s = store().sessions.get(id);
  if (!s) throw notFound("세션");
  return s;
}
/** 딥링크/새로고침 안전: 알 수 없는 id 는 경제학 1장 PREPARING 세션으로 자동 생성 */
export function getOrCreateSession(id: string): SessionRec {
  const st = store();
  let s = st.sessions.get(id);
  if (!s) {
    if (!/^sess_[A-Za-z0-9_-]{1,40}$/.test(id)) throw notFound("세션");
    s = blankSession(id, DEFAULT_USER, "chp_econ_1", "EASY");
    st.sessions.set(id, s);
  }
  return s;
}
export function createSession(userId: string, chapterId: string, level: JuniorLevel = "EASY"): string {
  getChapter(chapterId);
  const id = newId("sess");
  store().sessions.set(id, blankSession(id, userId, chapterId, level));
  return id;
}
export function deleteSession(id: string) {
  getSession(id);
  store().sessions.delete(id);
}
const touch = (s: SessionRec) => {
  s.updatedAt = now();
};
export const userMessages = (s: SessionRec) =>
  s.messages.filter((m) => m.role === "USER" && !m.excluded).map((m, i) => ({ ref: i + 1, content: m.content }));

/* ───────── DTO ───────── */
export function toSessionDto(s: SessionRec): SessionDto {
  const c = getChapter(s.chapterId);
  const m = getMaterialRec(c.materialId);
  return {
    sessionId: s.sessionId,
    status: s.status,
    phase: s.phase,
    juniorLevel: s.juniorLevel,
    chapter: { chapterId: c.chapterId, order: c.order, title: c.title, points: c.points },
    material: { materialId: m.materialId, title: m.title, courseName: m.courseName },
    objectives: s.objectives,
    messages: s.messages.map(({ messageId, role, stage, content, createdAt }) => ({ messageId, role, stage, content, createdAt })),
    heardConcepts: s.heard,
    exam: s.exam
      ? {
          examId: s.exam.examId,
          status: s.exam.status,
          questions: s.exam.questions.map(({ qid, order, points, question, objectiveRef }) => ({ qid, order, points, question, objectiveRef })),
          answers: s.exam.questions
            .filter((q) => s.exam!.answers[q.qid])
            .map((q) => ({ qid: q.qid, answer: s.exam!.answers[q.qid].map((x) => x.sentence).join(" ") })),
        }
      : null,
    score: s.score,
    finalVerdict: s.finalVerdict,
    gapCount: s.gaps.length,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export function toGapDto(g: GapRec): GapDto {
  const { gapId, qid, title, diagnosis, evidenceQuote, concepts, sourceExcerpt, status, tutorMessages } = g;
  return { gapId, qid, title, diagnosis, evidenceQuote, concepts, sourceExcerpt, status, tutorMessages };
}

export function toResultDto(s: SessionRec): ResultDto {
  if (!["RESULT_READY", "REVIEWING", "COMPLETED"].includes(s.status) || !s.exam) throw invalidState("아직 채점 결과가 없습니다.");
  const c = getChapter(s.chapterId);
  const ex = s.exam;
  const items = ex.questions.map((q) => {
    const sentences = ex.answers[q.qid] ?? [];
    const grade = ex.grades[q.qid] ?? { score: 0, maxScore: q.points, verdict: "WRONG" as const, comment: "답안이 없습니다." };
    return { qid: q.qid, order: q.order, points: q.points, question: q.question, answer: sentences.map((x) => x.sentence).join(" "), sentences, grade };
  });
  const count = (v: string) => items.filter((i) => i.grade.verdict === v).length;
  const total = s.score ?? items.reduce((a, i) => a + i.grade.score, 0);
  return {
    sessionId: s.sessionId,
    status: s.status,
    totalScore: total,
    questionCount: items.length,
    correctCount: count("CORRECT"),
    partialCount: count("PARTIAL"),
    wrongCount: count("WRONG"),
    finalVerdict: s.finalVerdict ?? finalVerdictFor(total, s.gaps.length),
    items,
    gaps: s.gaps.map(toGapDto),
    chapter: { chapterId: c.chapterId, title: c.title, taughtAt: c.taughtAt, stableAt: c.stableAt },
  };
}

export function listSessions(userId: string): SessionListItemDto[] {
  return [...store().sessions.values()]
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((s) => {
      const c = getChapter(s.chapterId);
      const m = getMaterialRec(c.materialId);
      return {
        sessionId: s.sessionId,
        chapterTitle: c.title,
        materialTitle: m.title,
        courseName: m.courseName,
        status: s.status,
        stageLabel: stageLabelFor(s.status),
        score: s.score,
        finalVerdict: s.finalVerdict,
        updatedAt: s.updatedAt,
      };
    });
}

/* ───────── 전이 ───────── */
function expect(s: SessionRec, statuses: SessionStatus[], msg?: string) {
  if (!statuses.includes(s.status)) throw invalidState(msg ?? `현재 상태(${s.status})에서는 할 수 없는 요청입니다.`);
}
export function addMessage(s: SessionRec, role: "USER" | "JUNIOR", stage: MessageStage, content: string): MsgRec {
  const m: MsgRec = { messageId: newId("msg"), role, stage, content, createdAt: now(), excluded: false };
  s.messages.push(m);
  touch(s);
  return m;
}

/** prepare 완료 처리: objectives / exam(READY) / 첫 질문 → EXPLAINING */
export function finishPrepare(s: SessionRec): void {
  expect(s, ["PREPARING"]);
  const pack = packFor(s.chapterId);
  s.objectives = pack.objectives;
  s.exam = {
    examId: newId("exam"),
    status: "READY",
    createdAt: now(),
    questions: pack.questions.map(({ qid, order, points, question, objectiveRef, rubric }) => ({ qid, order, points, question, objectiveRef, rubric })),
    answers: {},
    grades: {},
  };
  s.status = "EXPLAINING";
  s.phase = "QUESTION";
  addMessage(s, "JUNIOR", "QUESTION", pack.nextQuestions[s.juniorLevel].o1);
}

export function patchLevel(s: SessionRec, level: JuniorLevel) {
  expect(s, ["PREPARING", "EXPLAINING"], "가르치는 중에만 난이도를 바꿀 수 있습니다.");
  if (s.status === "EXPLAINING" && s.messages.some((m) => m.role === "USER")) {
    throw invalidState("설명을 시작한 뒤에는 난이도를 바꿀 수 없습니다.");
  }
  s.juniorLevel = level;
  // 아직 설명 전이면 첫 질문 말투를 새 난이도로 교체
  const first = s.messages[0];
  if (s.status === "EXPLAINING" && first && first.role === "JUNIOR" && s.messages.length === 1) {
    first.content = packFor(s.chapterId).nextQuestions[level].o1;
  }
  touch(s);
}

export function assertExplaining(s: SessionRec) {
  if (s.status !== "EXPLAINING" || s.phase !== "QUESTION") throw invalidState("지금은 설명을 보낼 수 없습니다.");
}

export function finishExplanation(s: SessionRec) {
  expect(s, ["EXPLAINING"]);
  if (s.phase === "EXAM_READY") return;
  if (!s.messages.some((m) => m.role === "USER" && !m.excluded)) {
    throw new MockError(409, "NO_EXPLANATION", "설명을 한 번 이상 해야 시험을 볼 수 있습니다.");
  }
  s.phase = "EXAM_READY";
  touch(s);
}

export function startExam(s: SessionRec): StartExamResponse {
  if (!(s.status === "EXPLAINING" && s.phase === "EXAM_READY") || !s.exam) throw invalidState("설명을 마친 뒤에 시험을 시작할 수 있습니다.");
  s.status = "EXAM_IN_PROGRESS";
  s.exam.status = "IN_PROGRESS";
  touch(s);
  return {
    status: "EXAM_IN_PROGRESS",
    exam: { examId: s.exam.examId, questions: s.exam.questions.map(({ qid, order, points, question, objectiveRef }) => ({ qid, order, points, question, objectiveRef })) },
  };
}

export const allAnswered = (s: SessionRec) => !!s.exam && s.exam.questions.every((q) => s.exam!.answers[q.qid]);

export function saveAnswer(s: SessionRec, qid: string, sentences: AnswerSentenceDto[]) {
  expect(s, ["EXAM_IN_PROGRESS"]);
  s.exam!.answers[qid] = sentences;
  touch(s);
}

export function startEvaluating(s: SessionRec) {
  expect(s, ["EXAM_IN_PROGRESS"], "시험이 끝난 뒤에 채점할 수 있습니다.");
  if (!allAnswered(s)) throw invalidState("모든 문항의 답안이 작성되어야 채점할 수 있습니다.");
  s.status = "EVALUATING";
  s.exam!.status = "EVALUATING";
  touch(s);
}

export function finishEvaluating(s: SessionRec, grades: Record<string, GradeDto>, gaps: GapRec[]) {
  expect(s, ["EVALUATING"]);
  s.exam!.grades = grades;
  s.exam!.status = "GRADED";
  s.gaps = gaps;
  s.score = Object.values(grades).reduce((a, g) => a + g.score, 0);
  s.finalVerdict = finalVerdictFor(s.score, gaps.length);
  s.status = "RESULT_READY";
  touch(s);
}

export function findGap(s: SessionRec, gapId: string): GapRec {
  const g = s.gaps.find((x) => x.gapId === gapId);
  if (!g) throw notFound("놓친 곳");
  return g;
}

export function markGapReviewed(s: SessionRec, gapId: string): number {
  expect(s, ["RESULT_READY", "REVIEWING"]);
  findGap(s, gapId).status = "REVIEWED";
  s.status = "REVIEWING";
  touch(s);
  return s.gaps.filter((g) => g.status !== "REVIEWED").length;
}

export function addTutorMessage(s: SessionRec, gapId: string, request: string, response: string): TutorMessageDto {
  expect(s, ["RESULT_READY", "REVIEWING"]);
  const tm = { id: newId("tm"), request, response, createdAt: now() };
  findGap(s, gapId).tutorMessages.push(tm);
  touch(s);
  return tm;
}

export function complete(s: SessionRec): CompleteResponse {
  expect(s, ["RESULT_READY", "REVIEWING"]);
  const t = now();
  s.status = "COMPLETED";
  s.completedAt = t;
  const c = getChapter(s.chapterId);
  if (!c.taughtAt) c.taughtAt = t;
  const open = s.gaps.filter((g) => g.status !== "REVIEWED").length;
  if (s.gaps.length === 0 && !c.stableAt) c.stableAt = t;
  touch(s);
  return { status: "COMPLETED", score: s.score, finalVerdict: s.finalVerdict, openGapCount: open, chapter: { taughtAt: c.taughtAt, stableAt: c.stableAt } };
}

export function excludeMessage(s: SessionRec, mid: string) {
  const m = s.messages.find((x) => x.messageId === mid);
  if (!m || m.role !== "USER") throw notFound("메시지");
  m.excluded = true;
  touch(s);
}

/* ───────── 자료 ───────── */
function chapterAction(chapterId: string): { action: ChapterAction; best: number | null; openGaps: number } {
  const sessions = [...store().sessions.values()].filter((s) => s.chapterId === chapterId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = sessions.find((s) => s.status !== "COMPLETED" && s.status !== "FAILED");
  const done = sessions.filter((s) => s.status === "COMPLETED");
  const best = done.reduce<number | null>((a, s) => (s.score !== null && (a === null || s.score > a) ? s.score : a), null);
  const openGaps = done[0] ? done[0].gaps.filter((g) => g.status !== "REVIEWED").length : 0;
  const action: ChapterAction = active ? { kind: "CONTINUE", sessionId: active.sessionId, status: active.status } : done.length ? { kind: "RETRY" } : { kind: "START" };
  return { action, best, openGaps };
}

export function getMaterial(id: string): MaterialDto {
  const m = getMaterialRec(id);
  const st = store();
  const sources = [...st.sources.values()].filter((s) => s.materialId === id).map(({ sourceId, kind, fileName, charCount }) => ({ sourceId, kind, fileName, charCount }));
  const chapters = [...st.chapters.values()]
    .filter((c) => c.materialId === id)
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const { action, best, openGaps } = chapterAction(c.chapterId);
      return {
        chapterId: c.chapterId,
        order: c.order,
        title: c.title,
        points: c.points,
        sourceId: c.sourceId,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
        action,
        taughtAt: c.taughtAt,
        stableAt: c.stableAt,
        bestScore: best,
        openGapCount: openGaps,
      };
    });
  return { materialId: m.materialId, title: m.title, courseName: m.courseName, examDate: m.examDate, status: m.status, error: m.error, sources, chapters };
}

export function listMaterials(userId: string): MaterialListItemDto[] {
  return [...store().materials.values()]
    .filter((m) => m.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((m) => {
      const chs = [...store().chapters.values()].filter((c) => c.materialId === m.materialId);
      return {
        materialId: m.materialId,
        title: m.title,
        courseName: m.courseName,
        examDate: m.examDate,
        status: m.status,
        chapterCount: chs.length,
        taughtCount: chs.filter((c) => c.taughtAt).length,
        createdAt: m.createdAt,
      };
    });
}

export function createMaterial(userId: string, courseName: string, examDate: string | null, files: Array<{ fileName: string; kind: SourceKind; text: string }>) {
  const st = store();
  const materialId = newId("mat");
  st.materials.set(materialId, { materialId, userId, courseName, examDate, title: "새 자료", status: "PENDING", error: null, createdAt: now() });
  const sources = files.map((f) => {
    const sourceId = newId("src");
    const rec: SourceRec = { sourceId, materialId, kind: f.kind, fileName: f.fileName, text: f.text, charCount: f.text.length };
    st.sources.set(sourceId, rec);
    return { sourceId, kind: f.kind, fileName: f.fileName, charCount: rec.charCount };
  });
  return { materialId, status: "PENDING" as const, sources };
}

export function deleteMaterial(id: string) {
  getMaterialRec(id);
  const st = store();
  const chapterIds = [...st.chapters.values()].filter((c) => c.materialId === id).map((c) => c.chapterId);
  for (const [sid, s] of st.sessions) if (chapterIds.includes(s.chapterId)) st.sessions.delete(sid);
  for (const cid of chapterIds) {
    st.chapters.delete(cid);
    st.packs.delete(cid);
  }
  for (const [sid, s] of st.sources) if (s.materialId === id) st.sources.delete(sid);
  st.materials.delete(id);
}

export function materialSources(id: string): SourceRec[] {
  return [...store().sources.values()].filter((s) => s.materialId === id);
}

export function setChapters(materialId: string, title: string, chapters: Array<{ title: string; points: string[]; sourceId: string; startOffset: number; endOffset: number }>) {
  const st = store();
  const m = getMaterialRec(materialId);
  for (const [cid, c] of st.chapters) if (c.materialId === materialId) st.chapters.delete(cid);
  const out = chapters.map((c, i) => {
    const chapterId = newId("chp");
    st.chapters.set(chapterId, { chapterId, materialId, order: i + 1, title: c.title, points: c.points, sourceId: c.sourceId, startOffset: c.startOffset, endOffset: c.endOffset, taughtAt: null, stableAt: null });
    return { chapterId, order: i + 1, title: c.title, points: c.points };
  });
  m.title = title;
  m.status = "READY";
  return out;
}

export function getSourceContent(sourceId: string): SourceContentDto {
  const s = store().sources.get(sourceId);
  if (!s) throw notFound("자료 원문");
  return { sourceId: s.sourceId, fileName: s.fileName, text: s.text };
}

/* ───────── 홈 ───────── */
const TODAY = () => new Date().toISOString().slice(0, 10);
function dDay(examDate: string | null): number | null {
  if (!examDate) return null;
  const a = Date.parse(`${TODAY()}T00:00:00Z`);
  const b = Date.parse(`${examDate.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
export function streakDays(userId: string): number {
  const days = new Set([...store().sessions.values()].filter((s) => s.userId === userId && s.status === "COMPLETED").map((s) => (s.completedAt ?? s.updatedAt).slice(0, 10)));
  let n = 0;
  const d = new Date(`${TODAY()}T00:00:00Z`);
  if (!days.has(TODAY())) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
export function homeDto(userId: string): HomeDto {
  const st = store();
  const user = getUser(userId);
  const mats = [...st.materials.values()].filter((m) => m.userId === userId);
  const byCourse = new Map<string, MaterialRec[]>();
  for (const m of mats) byCourse.set(m.courseName, [...(byCourse.get(m.courseName) ?? []), m]);
  const sessions = [...st.sessions.values()].filter((s) => s.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const courses = [...byCourse.entries()]
    .map(([courseName, list]) => ({
      courseName,
      examDate: list[0].examDate,
      dDay: dDay(list[0].examDate),
      materials: list.map((m) => {
        const chs = [...st.chapters.values()].filter((c) => c.materialId === m.materialId);
        const active = sessions.find((s) => chs.some((c) => c.chapterId === s.chapterId) && s.status !== "COMPLETED" && s.status !== "FAILED");
        return {
          materialId: m.materialId,
          title: m.title,
          chapterCount: chs.length,
          taughtCount: chs.filter((c) => c.taughtAt).length,
          resume: active ? { sessionId: active.sessionId, chapterTitle: getChapter(active.chapterId).title, status: active.status, stageLabel: stageLabelFor(active.status) } : null,
        };
      }),
    }))
    .sort((a, b) => (a.dDay ?? 9999) - (b.dDay ?? 9999));
  const done = sessions.filter((s) => s.status === "COMPLETED" && s.score !== null);
  return {
    userName: user?.nickname ?? "선배",
    courses,
    recentSessions: sessions.slice(0, 5).map((s) => {
      const c = getChapter(s.chapterId);
      return { sessionId: s.sessionId, chapterTitle: c.title, materialTitle: getMaterialRec(c.materialId).title, status: s.status, score: s.score, finalVerdict: s.finalVerdict, updatedAt: s.updatedAt };
    }),
    stats: {
      completedSessions: done.length,
      averageScore: done.length ? Math.round(done.reduce((a, s) => a + (s.score ?? 0), 0) / done.length) : null,
      streakDays: streakDays(userId),
    },
  };
}
