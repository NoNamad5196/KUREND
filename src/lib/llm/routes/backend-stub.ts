/** Explicit, ephemeral D-route demo storage. Not a replacement for C's DB/auth. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import osChapters from "../../../../fixtures/chapters.os.json";
import economicsChapters from "../../../../fixtures/chapters.economics.json";
import osDemo from "../../../../fixtures/demo.os.json";
import { finalVerdictFor } from "@/contracts/types";
import {
  RouteError, type ChapterRecord, type MaterialRecord,
  type RouteBackend, type SessionRecord,
} from "./backend";
import { normalizedSessionDto } from "./prisma-backend";

export const D_STUB_IDS = {
  user: "usr_demo1",
  osMaterial: "mat_d_os",
  economicsMaterial: "mat_d_economics",
  pendingMaterial: "mat_d_generate",
  prepareSession: "sess_d_prepare",
  economicsPrepareSession: "sess_d_economics",
  examSession: "sess_d_exam",
  resultSession: "sess_d_result",
  completedSession: "sess_d_completed",
} as const;

export interface StubBackendSeed {
  materials?: MaterialRecord[];
  sessions?: SessionRecord[];
  users?: string[];
}

interface ChapterFixture {
  title: string;
  courseName: string;
  fileName: string;
  sourceId: string;
  chapters: Omit<ChapterRecord, "chapterId" | "order" | "taughtAt" | "stableAt">[];
}
const seedTime = "2026-10-01T00:00:00.000Z";

function fixtureMaterial(fixture: ChapterFixture, materialId: string, chapterPrefix: string): MaterialRecord {
  const text = readFileSync(join(process.cwd(), "fixtures", fixture.fileName), "utf8");
  return {
    materialId, userId: D_STUB_IDS.user, revision: 1,
    title: fixture.title, courseName: fixture.courseName, status: "READY", error: null,
    sources: [{ sourceId: fixture.sourceId, kind: "MD", fileName: fixture.fileName, text, charCount: text.length }],
    chapters: fixture.chapters.map((item, index) => ({
      ...item, chapterId: `${chapterPrefix}_${index + 1}`, order: index + 1,
      taughtAt: null, stableAt: null,
    })),
  };
}

/** Stable fixture IDs make the standalone SSE routes directly curl-able. */
export function createDefaultStubSeed(): Required<StubBackendSeed> {
  const os = fixtureMaterial(osChapters, D_STUB_IDS.osMaterial, "chp_d_os");
  const economics = fixtureMaterial(economicsChapters, D_STUB_IDS.economicsMaterial, "chp_d_economics");
  const pending: MaterialRecord = {
    ...structuredClone(os), materialId: D_STUB_IDS.pendingMaterial, title: "새 자료", status: "PENDING", chapters: [],
    sources: os.sources.map((source) => ({ ...source, sourceId: "src_d_generate" })),
  };
  const fixtureChapter = os.chapters[osDemo.chapterIndex];
  fixtureChapter.taughtAt = seedTime;
  const base: SessionRecord = {
    sessionId: D_STUB_IDS.prepareSession, userId: D_STUB_IDS.user, revision: 1,
    status: "PREPARING", phase: "QUESTION", juniorLevel: "EASY",
    chapter: { ...fixtureChapter, text: os.sources[0].text.slice(fixtureChapter.startOffset, fixtureChapter.endOffset) },
    material: { materialId: os.materialId, title: os.title, courseName: os.courseName },
    objectives: [], heardConcepts: [], messages: [], exam: null, gaps: [],
    score: null, finalVerdict: null, error: null, createdAt: seedTime, updatedAt: seedTime,
  };
  const economicsChapter = economics.chapters[0];
  const economicsPrepare: SessionRecord = {
    ...structuredClone(base), sessionId: D_STUB_IDS.economicsPrepareSession,
    chapter: { ...economicsChapter, text: economics.sources[0].text.slice(economicsChapter.startOffset, economicsChapter.endOffset) },
    material: { materialId: economics.materialId, title: economics.title, courseName: economics.courseName },
  };
  const exam: SessionRecord = {
    ...structuredClone(base), sessionId: D_STUB_IDS.examSession, status: "EXAM_IN_PROGRESS", phase: "EXAM_READY",
    objectives: structuredClone(osDemo.prepare.objectives), heardConcepts: [...osDemo.heardConcepts],
    messages: osDemo.taught.map((message, index) => ({
      messageId: `msg_d_exam_${index + 1}`, role: "USER", stage: "ANSWER", content: message.content,
      excluded: false, createdAt: new Date(new Date(seedTime).getTime() + index * 1000).toISOString(),
    })),
    exam: { examId: "exam_d_exam", status: "IN_PROGRESS", questions: structuredClone(osDemo.prepare.questions), answers: [], grades: [] },
  };
  const answers: NonNullable<SessionRecord["exam"]>["answers"] = osDemo.answers.map((item) => ({
    qid: item.qid, answer: item.answer,
    sentences: item.sentences.map((sentence) => ({
      sentence: sentence.text, ref: sentence.ref,
      level: sentence.level as "STRONG" | "FAINT" | "NONE", unlearned: sentence.unlearned,
    })),
  }));
  const grades: NonNullable<SessionRecord["exam"]>["grades"] = osDemo.grades.map((item) => ({
    qid: item.qid, score: item.score, maxScore: item.maxScore,
    verdict: item.verdict as "CORRECT" | "PARTIAL" | "WRONG", comment: item.comment,
  }));
  const gaps: SessionRecord["gaps"] = grades.filter((grade) => grade.verdict !== "CORRECT").map((grade) => ({
    gapId: `gap_d_result_${grade.qid}`, qid: grade.qid, title: `${grade.qid}에서 빠진 개념`,
    diagnosis: grade.comment, evidenceQuote: osDemo.taught[0]?.content ?? "",
    concepts: [...fixtureChapter.points], sourceExcerpt: base.chapter.text.slice(0, 500),
    sourceOffset: fixtureChapter.startOffset, status: "FOUND", tutorMessages: [],
  }));
  const score = grades.reduce((sum, grade) => sum + grade.score, 0);
  const result: SessionRecord = {
    ...structuredClone(exam), sessionId: D_STUB_IDS.resultSession, status: "RESULT_READY",
    messages: exam.messages.map((message, index) => ({ ...message, messageId: `msg_d_result_${index + 1}` })),
    exam: { ...exam.exam!, examId: "exam_d_result", status: "GRADED", answers, grades },
    gaps, score, finalVerdict: finalVerdictFor(score, gaps.length),
  };
  // A completed home/result fixture requested by §3-1 (94 points, one gap).
  const completed: SessionRecord = {
    ...structuredClone(result), sessionId: D_STUB_IDS.completedSession, status: "COMPLETED", score: 94, finalVerdict: "MOSTLY",
    heardConcepts: [...fixtureChapter.points],
    messages: [...result.messages.map((message, index) => ({ ...message, messageId: `msg_d_completed_${index + 1}` })), {
      messageId: "msg_d_completed_4", role: "USER", stage: "ANSWER", excluded: false,
      content: "문맥 교환에서는 이전 프로세스의 문맥을 저장하고 다음 프로세스의 문맥을 복구해.",
      createdAt: new Date(new Date(seedTime).getTime() + 3000).toISOString(),
    }],
    exam: { ...structuredClone(result.exam!), examId: "exam_d_completed",
      answers: answers.map((answer) => answer.qid === "q3" ? {
        qid: "q3", answer: "문맥 교환에서는 이전 프로세스의 문맥을 저장하고 다음 프로세스의 문맥을 복구해요.",
        sentences: [{ sentence: "문맥 교환에서는 이전 프로세스의 문맥을 저장하고 다음 프로세스의 문맥을 복구해요.", ref: 4, level: "STRONG", unlearned: false }],
      } : answer),
      grades: grades.map((grade, index) => ({ ...grade, score: grade.maxScore - (index === 2 ? 6 : 0),
        verdict: index === 2 ? "PARTIAL" : "CORRECT", comment: index === 2 ? "마지막 개념의 설명이 조금 부족해요." : "핵심 개념을 잘 설명했어요." })) },
    gaps: [{
      gapId: "gap_d_completed_q3", qid: "q3", title: "문맥 교환 비용",
      diagnosis: "문맥을 저장하고 복구하는 과정은 설명했지만, 전환 시간에 유용한 사용자 계산이 진행되지 않는다는 점이 빠졌어요.",
      evidenceQuote: "문맥 교환에서는 이전 프로세스의 문맥을 저장하고 다음 프로세스의 문맥을 복구해.",
      concepts: ["문맥 교환 비용"], sourceExcerpt: base.chapter.text,
      sourceOffset: fixtureChapter.startOffset, status: "FOUND", tutorMessages: [],
    }],
    chapter: { ...base.chapter, taughtAt: seedTime },
  };
  return {
    users: ["usr_demo1", "usr_demo2", "usr_demo3"], materials: [os, economics, pending],
    sessions: [base, economicsPrepare, exam, result, completed],
  };
}

/** In-process compare-and-swap is synchronous: no await can split a commit. */
export function createStubBackend(seed?: StubBackendSeed): RouteBackend {
  const initial = seed ?? createDefaultStubSeed();
  const users = new Set(initial.users ?? ["usr_demo1", "usr_demo2", "usr_demo3"]);
  const materials = new Map((initial.materials ?? []).map((item) => [item.materialId, structuredClone(item)]));
  const sessions = new Map((initial.sessions ?? []).map((item) => [item.sessionId, structuredClone(item)]));
  return {
    async requireUser(request) {
      const cookieName = process.env.SESSION_COOKIE || "tb_uid";
      const entries = (request.headers.get("cookie") ?? "").split(";").map((entry) => entry.trim());
      const matches = entries.filter((entry) => entry.startsWith(`${cookieName}=`));
      if (matches.length !== 1) throw new RouteError(401, "UNAUTHORIZED", "데모 로그인이 필요합니다.");
      let id: string;
      try { id = decodeURIComponent(matches[0].slice(cookieName.length + 1)); }
      catch { throw new RouteError(401, "UNAUTHORIZED", "유효하지 않은 로그인 쿠키입니다."); }
      if (!users.has(id)) throw new RouteError(401, "UNAUTHORIZED", "데모 계정을 찾을 수 없습니다.");
      return { id };
    },
    async getMaterial(materialId, userId) {
      const material = materials.get(materialId);
      return material?.userId === userId ? structuredClone(material) : null;
    },
    async getSession(sessionId, userId) {
      const session = sessions.get(sessionId);
      return session?.userId === userId ? structuredClone(session) : null;
    },
    async commitMaterial(previous, next) {
      const current = materials.get(previous.materialId);
      if (!current || current.userId !== previous.userId) throw new RouteError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
      if (current.revision !== previous.revision || next.materialId !== previous.materialId || next.userId !== previous.userId) {
        throw new RouteError(409, "INVALID_STATE", "다른 요청이 먼저 자료를 변경했습니다.");
      }
      const saved = { ...structuredClone(next), revision: current.revision + 1 };
      materials.set(saved.materialId, saved);
      return structuredClone(saved);
    },
    async commitSession(previous, next) {
      const current = sessions.get(previous.sessionId);
      if (!current || current.userId !== previous.userId) throw new RouteError(404, "NOT_FOUND", "세션을 찾을 수 없습니다.");
      if (current.revision !== previous.revision || next.sessionId !== previous.sessionId || next.userId !== previous.userId) {
        throw new RouteError(409, "INVALID_STATE", "다른 요청이 먼저 세션을 변경했습니다.");
      }
      const saved = { ...structuredClone(next), revision: current.revision + 1,
        updatedAt: new Date(Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1)).toISOString() };
      sessions.set(saved.sessionId, saved);
      return structuredClone(saved);
    },
    toSessionDto: normalizedSessionDto,
  };
}

const stubSymbol = Symbol.for("teachback.d.stub-backend");
type StubGlobal = typeof globalThis & { [stubSymbol]?: RouteBackend };
export function getStubBackend(): RouteBackend {
  const shared = globalThis as StubGlobal;
  return shared[stubSymbol] ??= createStubBackend();
}
export function resetStubBackend(seed?: StubBackendSeed): RouteBackend {
  const backend = createStubBackend(seed);
  (globalThis as StubGlobal)[stubSymbol] = backend;
  return backend;
}
