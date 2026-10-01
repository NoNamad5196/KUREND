import { nanoid } from "nanoid";
import { z } from "zod";
import {
  ExplanationRequestSchema, ExamAnswerRequestSchema, SessionSchema,
  TutorRequestSchema, TUTOR_PRESET_REQUEST, finalVerdictFor,
  type AnswerSentenceDto, type GapDto, TeachingChoicesSchema,
} from "@/contracts/types";
import type { SseEvent } from "@/contracts/events";
import { objectiveTopic, teachingChoicesFor, matchQuestionObjective } from "@/lib/llm/teaching-choices";
import { normalizePersonaAddress, personaQuestion } from "@/lib/llm/personas";
import type { ConceptMasteryDto } from "@/contracts/game";
import type { Llm, TaughtMsg } from "@/lib/llm";
import { createSse } from "@/lib/server/sse";
import {
  getRouteBackend, RouteError, type MaterialRecord, type MessageRecord,
  type RouteBackend, type SessionRecord,
} from "./backend";

type Sse = ReturnType<typeof createSse>;
type Send = <E extends SseEvent["event"]>(
  event: E, data: Extract<SseEvent, { event: E }>["data"],
) => void;

// Shared across route modules and development reloads, including different
// operations on one session. Persistent adapters also enforce revision CAS.
const locksSymbol = Symbol.for("teachback.d.route-locks");
type LockGlobal = typeof globalThis & { [locksSymbol]?: Set<string> };
const routeLocks = ((globalThis as LockGlobal)[locksSymbol] ??= new Set<string>());

function invalidState(message = "현재 상태에서는 이 작업을 진행할 수 없습니다."): never {
  throw new RouteError(409, "INVALID_STATE", message);
}

function modelFailure(): never {
  throw new RouteError(502, "LLM_FAILED", "모델 응답을 처리하지 못했습니다. 다시 시도해 주세요.");
}

function acquire(key: string): () => void {
  if (routeLocks.has(key)) invalidState("같은 자료나 세션의 다른 작업이 진행 중입니다.");
  routeLocks.add(key);
  return () => { routeLocks.delete(key); };
}

function routeFailure(error: unknown, fallbackMessage: string): RouteError {
  // C's adapter may use another module instance (instrumentation vs. routes),
  // so its RouteError has a different constructor. Validate the public shape
  // before using its fields in either an HTTP response or an SSE error event.
  if (error !== null && typeof error === "object") {
    const { name, status, code, message } = error as Record<string, unknown>;
    if ((error instanceof RouteError || name === "RouteError")
      && (status === 400 || status === 401 || status === 404 || status === 409 || status === 502)
      && (code === "VALIDATION" || code === "UNAUTHORIZED" || code === "NOT_FOUND"
        || code === "INVALID_STATE" || code === "LLM_FAILED")
      && typeof message === "string" && message.trim()) {
      return new RouteError(status, code, message);
    }
  }
  return new RouteError(502, "LLM_FAILED", fallbackMessage);
}

function failureResponse(error: unknown): Response {
  if (error instanceof Response) return error;
  const failure = routeFailure(error, "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status });
}

async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try { body = await request.json(); } catch {
    throw new RouteError(400, "VALIDATION", "올바른 JSON 요청이 필요합니다.");
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new RouteError(400, "VALIDATION", "요청 내용을 확인해 주세요.");
  return result.data;
}

function checkActive(request: Request): void {
  if (request.signal.aborted) throw new RouteError(502, "LLM_FAILED", "요청이 취소되었습니다. 다시 시도해 주세요.");
}

function stream(
  request: Request,
  release: () => void,
  work: (send: Send) => Promise<void>,
  recover?: () => Promise<void>,
): Response {
  let channel: Sse;
  try { channel = createSse(); } catch (error) { release(); throw error; }
  const send: Send = (event, data) => {
    checkActive(request);
    channel.send(event, data);
  };
  void (async () => {
    try {
      checkActive(request);
      await work(send);
    } catch (error) {
      // Recovery is a CAS transaction too: never overwrite an external update.
      try { await recover?.(); } catch { /* The adapter rejects a stale recovery. */ }
      const failure = routeFailure(error, "모델 응답을 처리하지 못했습니다. 다시 시도해 주세요.");
      channel.send("error", { code: failure.code, message: failure.message });
    } finally {
      // createSse.close emits exactly one terminal done, including error paths.
      channel.close();
      release();
    }
  })();
  return channel.response;
}

function message(role: MessageRecord["role"], stage: MessageRecord["stage"], content: string): MessageRecord {
  return { messageId: `msg_${nanoid(14)}`, role, stage, content, excluded: false, createdAt: new Date().toISOString() };
}

function taughtMessages(session: SessionRecord): TaughtMsg[] {
  return session.messages.filter((item) => item.role === "USER" && !item.excluded)
    .map((item, index) => ({ ref: index + 1, content: item.content }));
}

function sentences(text: string): string[] {
  return text.match(/[^.!?。！？]+[.!?。！？]*\s*|[.!?。！？]+\s*/gu) ?? [text];
}

function safeSessionDto(backend: RouteBackend, session: SessionRecord) {
  // Parse reconstructs the public shape and strips rubric/source text even if
  // a future adapter accidentally returns its entire internal aggregate.
  return SessionSchema.parse(backend.toSessionDto(session));
}

function owned<T>(record: T | null): T {
  if (!record) throw new RouteError(404, "NOT_FOUND", "자료나 세션을 찾을 수 없습니다.");
  return record;
}

export function createRouteHandlers({ backend, llm }: { backend: RouteBackend; llm: Llm }) {
  async function loadSession(request: Request, id: string): Promise<SessionRecord> {
    const user = await backend.requireUser(request);
    return owned(await backend.getSession(id, user.id));
  }

  async function saveSession(request: Request, previous: SessionRecord, next: SessionRecord) {
    checkActive(request);
    return backend.commitSession(previous, { ...next, updatedAt: new Date().toISOString() });
  }

  const handlers = {
    async generate(request: Request, id: string): Promise<Response> {
      const user = await backend.requireUser(request);
      const material = owned(await backend.getMaterial(id, user.id));
      if (material.status !== "PENDING" && material.status !== "FAILED") invalidState();
      if (!material.sources.length || material.sources.some((source) => !source.text.trim())) {
        throw new RouteError(400, "VALIDATION", "목차를 생성할 자료의 본문이 없습니다.");
      }
      const release = acquire(`material:${id}`);
      return stream(request, release, async (send) => {
        const started = Date.now();
        const progress = (step: "READING" | "SPLITTING" | "TITLING", text: string) => {
          send("progress", { step, message: text, elapsedMs: Date.now() - started });
        };
        progress("READING", "올려주신 자료를 읽고 있어요.");
        const sources = material.sources.map(({ sourceId, text }) => ({ sourceId, text }));
        progress("SPLITTING", "자료의 흐름에 따라 목차를 나누고 있어요.");
        const generated = await llm.generateChapters({ sources });
        if (generated.chapters.length < 4 || generated.chapters.length > 12 || !generated.title.trim() || generated.title.length > 20) modelFailure();
        let previousSourceIndex = -1;
        const ends = new Map<string, number>();
        for (const chapter of generated.chapters) {
          const source = sources.find((candidate) => candidate.sourceId === chapter.sourceId);
          const sourceIndex = sources.findIndex((candidate) => candidate.sourceId === chapter.sourceId);
          if (!source || !Number.isInteger(chapter.startOffset) || !Number.isInteger(chapter.endOffset)
            || chapter.startOffset < 0 || chapter.endOffset <= chapter.startOffset || chapter.endOffset > source.text.length
            || !chapter.title.trim() || chapter.title.length > 20 || chapter.points.length < 2 || chapter.points.length > 4
            || chapter.points.some((point) => !point.trim() || point.length > 15)
            || sourceIndex < previousSourceIndex || chapter.startOffset < (ends.get(chapter.sourceId) ?? 0)) modelFailure();
          ends.set(chapter.sourceId, chapter.endOffset);
          previousSourceIndex = sourceIndex;
        }
        progress("TITLING", "목차의 제목과 핵심 포인트를 정리하고 있어요.");
        const next: MaterialRecord = {
          ...material, title: generated.title, status: "READY", error: null,
          chapters: generated.chapters.map((chapter, index) => ({
            ...chapter, chapterId: `chp_${nanoid(14)}`, order: index + 1, taughtAt: null, stableAt: null,
          })),
        };
        checkActive(request);
        const saved = await backend.commitMaterial(material, next);
        send("chapters", {
          title: saved.title,
          chapters: saved.chapters.map(({ chapterId, order, title, points }) => ({ chapterId, order, title, points })),
        });
      });
    },

    async prepare(request: Request, id: string): Promise<Response> {
      const session = await loadSession(request, id);
      if (session.status !== "PREPARING" && session.status !== "EXPLAINING") invalidState();
      const release = acquire(`session:${id}`);
      return stream(request, release, async (send) => {
        if (session.status === "EXPLAINING") {
          let resumed = session;
          const last = session.messages.at(-1);
          if (session.game?.character === "MALE_EASY" && session.phase === "QUESTION"
            && last?.role === "JUNIOR" && last.stage === "QUESTION" && !last.teachingChoices
            && !session.objectives.every((objective) => session.game!.mastery.some((item) => item.concept === objectiveTopic(objective) && item.mastery >= 100))) {
            const objective = matchQuestionObjective(session.objectives, last.content)
              ?? session.objectives.find((item) => !session.heardConcepts.includes(objectiveTopic(item)));
            if (objective) {
              const topic = objectiveTopic(objective);
              const teachingChoices = teachingChoicesFor(session.chapter, topic);
              if (teachingChoices.length) resumed = await saveSession(request, session, { ...session,
                messages: session.messages.map((item) => item.messageId === last.messageId ? {
                  ...item, content: personaQuestion(topic, "MALE_EASY"), teachingChoices,
                } : item),
              });
            }
          }
          send("ready", { session: safeSessionDto(backend, resumed) });
          return;
        }
        const started = Date.now();
        send("progress", { step: "OBJECTIVES", message: "이 목차의 학습 목표를 정하고 있어요.", elapsedMs: 0 });
        const prepared = await llm.prepareSession({ chapter: session.chapter, level: session.juniorLevel,
          persona: session.game?.character, examFormat: session.game?.examFormat });
        if (prepared.objectives.length !== 3 || new Set(prepared.objectives.map((item) => item.id)).size !== 3
          || prepared.questions.length !== 3 || new Set(prepared.questions.map((item) => item.qid)).size !== 3
          || prepared.questions.reduce((sum, item) => sum + item.points, 0) !== 100
          || prepared.questions.some((item) => !Number.isInteger(item.points) || item.points < 1
            || !prepared.objectives.some((objective) => objective.id === item.objectiveRef))
          || !prepared.firstQuestion.trim()
          || (session.game?.examFormat === "OBJECTIVE" && prepared.questions.some((item) =>
            item.choices?.length !== 4 || new Set(item.choices).size !== 4 || !/^정답 [①②③④];근거:/u.test(item.rubric)))) modelFailure();
        send("progress", { step: "QUESTIONS", message: "학습 목표에 맞는 시험 문제를 준비했어요.", elapsedMs: Date.now() - started });
        const firstQuestion = message("JUNIOR", "QUESTION", normalizePersonaAddress(prepared.firstQuestion, session.game?.character));
        if (session.game?.character === "MALE_EASY") {
          const choices = prepared.firstTeachingChoices ?? teachingChoicesFor(session.chapter, objectiveTopic(prepared.objectives[0]));
          if (choices.length) firstQuestion.teachingChoices = TeachingChoicesSchema.parse(choices);
        }
        send("progress", { step: "GREETING", message: "새내기가 선배의 설명을 기다리고 있어요.", elapsedMs: Date.now() - started });
        const saved = await saveSession(request, session, {
          ...session, status: "EXPLAINING", phase: "QUESTION", error: null,
          objectives: prepared.objectives, heardConcepts: [], messages: [...session.messages, firstQuestion],
          exam: { examId: `exam_${nanoid(14)}`, status: "READY", questions: prepared.questions, answers: [], grades: [] },
        });
        send("ready", { session: safeSessionDto(backend, saved) });
      });
    },

    async explanations(request: Request, id: string): Promise<Response> {
      let session = await loadSession(request, id);
      const body = await readBody(request, ExplanationRequestSchema);
      if (!body.content.trim()) throw new RouteError(400, "VALIDATION", "설명을 입력해 주세요.");
      if (session.status !== "EXPLAINING" || session.phase !== "QUESTION") invalidState();
      const release = acquire(`session:${id}`);
      return stream(request, release, async (send) => {
        // A failed turn leaves the USER message intact. Resending the same last
        // unanswered message reuses its ID rather than teaching it twice.
        const previousMessage = session.messages.at(-1);
        const retry = previousMessage?.role === "USER" && !previousMessage.excluded && previousMessage.content === body.content;
        const userMessage = retry ? previousMessage : message("USER", "ANSWER", body.content);
        const history = session.messages.filter((item) => !item.excluded && (!retry || item.messageId !== userMessage.messageId));
        if (!retry) session = await saveSession(request, session, { ...session, messages: [...session.messages, userMessage] });
        send("user.saved", { messageId: userMessage.messageId });
        let concepts: { heardConcepts: string[]; added: string[] } | undefined;
        let doubt: MessageRecord | undefined;
        const reactions: MessageRecord[] = [];
        let question: { record: MessageRecord; coveredObjectives: string[]; mastery?: ConceptMasteryDto[] } | undefined;
        for await (const event of llm.juniorTurn({
          chapter: session.chapter, level: session.juniorLevel, persona: session.game?.character, objectives: session.objectives,
          heardConcepts: session.heardConcepts, history, explanation: body.content, mastery: session.game?.mastery,
        })) {
          checkActive(request);
          if (event.type === "concepts") {
            if (concepts) modelFailure();
            concepts = { heardConcepts: event.heardConcepts, added: event.added };
            send("junior.concepts", concepts);
          } else if (event.type === "doubt") {
            if (!concepts || doubt || reactions.length || question || (!session.game && session.juniorLevel === "HARD") || !event.content.trim()) modelFailure();
            if (concepts.added.length || concepts.heardConcepts.length !== session.heardConcepts.length
              || concepts.heardConcepts.some((concept) => !session.heardConcepts.includes(concept))) modelFailure();
            doubt = message("JUNIOR", "DOUBT", event.content);
          } else if (event.type === "reaction") {
            if (!concepts || doubt || question || reactions.length >= 3 || !event.content.trim() || event.content.length > 40) modelFailure();
            reactions.push(message("JUNIOR", "REACTION", event.content));
            for (const token of sentences(event.content)) send("junior.token", { token });
          } else if (event.type === "question") {
            if (!concepts || doubt || !reactions.length || question || !event.content.trim()
              || event.coveredObjectives.some((ref) => !session.objectives.some((objective) => objective.id === ref))) modelFailure();
            const record = message("JUNIOR", "QUESTION", normalizePersonaAddress(event.content, session.game?.character));
            if (session.game?.character === "MALE_EASY" && event.teachingChoices?.length) record.teachingChoices = TeachingChoicesSchema.parse(event.teachingChoices);
            question = { record, coveredObjectives: event.coveredObjectives, mastery: event.mastery };
          }
        }
        if (!concepts || (!doubt && (!reactions.length || !question))) modelFailure();
        if (session.heardConcepts.some((concept) => !concepts.heardConcepts.includes(concept))
          || concepts.added.some((concept) => !concepts.heardConcepts.includes(concept) || session.heardConcepts.includes(concept))) modelFailure();
        const juniorMessages = doubt ? [doubt] : [...reactions, question!.record];
        await saveSession(request, session, {
          ...session, heardConcepts: concepts.heardConcepts, error: null, messages: [...session.messages, ...juniorMessages],
          ...(session.game && question?.mastery ? { game: { ...session.game, mastery: question.mastery } } : {}),
        });
        if (doubt) send("junior.doubt", { messageId: doubt.messageId, content: doubt.content });
        else {
          for (const reaction of reactions) send("junior.message", { messageId: reaction.messageId, stage: "REACTION", content: reaction.content });
          send("junior.question", { messageId: question!.record.messageId, content: question!.record.content, coveredObjectives: question!.coveredObjectives,
            ...(question!.record.teachingChoices ? { teachingChoices: question!.record.teachingChoices } : {}),
          });
        }
      });
    },

    async answers(request: Request, id: string): Promise<Response> {
      const session = await loadSession(request, id);
      const { qid } = await readBody(request, ExamAnswerRequestSchema);
      if (!qid.trim()) throw new RouteError(400, "VALIDATION", "문항 ID가 필요합니다.");
      const exam = session.exam;
      if (session.status !== "EXAM_IN_PROGRESS" || !exam || exam.status !== "IN_PROGRESS") invalidState();
      const question = exam.questions.find((candidate) => candidate.qid === qid);
      if (!question) throw new RouteError(404, "NOT_FOUND", "시험 문항을 찾을 수 없습니다.");
      const cached = exam.answers.find((answer) => answer.qid === qid);
      const release = acquire(`session:${id}`);
      return stream(request, release, async (send) => {
        if (cached) {
          send("answer.recap", { qid, sentences: cached.sentences });
          send("answer.saved", { qid, answer: cached.answer, cached: true });
          if (exam.questions.every((item) => exam.answers.some((answer) => answer.qid === item.qid))) send("exam.completed", { examId: exam.examId });
          return;
        }
        const taught = taughtMessages(session);
        const answerSentences: AnswerSentenceDto[] = [];
        let finalAnswer: string | undefined;
        let sourcesSent = false;
        for await (const event of llm.writeExamAnswer({ question: question.question, taught, heardConcepts: session.heardConcepts,
          persona: session.game?.character, choices: question.choices })) {
          checkActive(request);
          if (finalAnswer !== undefined) modelFailure();
          if (event.type === "sources") {
            if (sourcesSent || event.sources.some((source) => !taught.some((item) => item.ref === source.ref && item.content === source.content))) modelFailure();
            sourcesSent = true;
            send("answer.sources", { qid, sources: event.sources });
          } else if (event.type === "thought") {
            const characters = Array.from(event.token);
            if (!characters.length && event.closed) send("answer.thought", { qid, token: "", closed: true });
            characters.forEach((token, index) => send("answer.thought", { qid, token, closed: event.closed && index === characters.length - 1 }));
          } else if (event.type === "sentence") {
            if (!event.text.trim() || (event.ref !== null && !taught.some((item) => item.ref === event.ref))
              || (event.ref === null && (event.level !== "NONE" || !event.unlearned))) modelFailure();
            answerSentences.push({ sentence: event.text, ref: event.ref, level: event.level, unlearned: event.unlearned });
            send("answer.token", { qid, token: event.text });
            send("answer.recall", { qid, ref: event.ref, level: event.level, unlearned: event.unlearned });
          } else if (event.type === "final") finalAnswer = event.answer;
        }
        if (!sourcesSent || !finalAnswer?.trim() || !answerSentences.length) modelFailure();
        if (question.choices && (question.choices.length !== 4 || !question.choices.some((choice) => finalAnswer!.startsWith(choice.slice(0, 1))))) modelFailure();
        const normalized = (value: string) => value.replace(/\s+/gu, "").trim();
        if (normalized(finalAnswer) !== normalized(answerSentences.map((item) => item.sentence).join(" "))) modelFailure();
        const answers = [...exam.answers, { qid, answer: finalAnswer, sentences: answerSentences }];
        await saveSession(request, session, { ...session, error: null, exam: { ...exam, answers } });
        send("answer.saved", { qid, answer: finalAnswer, cached: false });
        if (exam.questions.every((item) => answers.some((answer) => answer.qid === item.qid))) send("exam.completed", { examId: exam.examId });
      });
    },

    async evaluate(request: Request, id: string): Promise<Response> {
      const session = await loadSession(request, id);
      const exam = session.exam;
      if (session.status !== "EXAM_IN_PROGRESS" || !exam || exam.status !== "IN_PROGRESS"
        || exam.questions.length !== 3 || exam.answers.length !== 3
        || !exam.questions.every((question) => exam.answers.some((answer) => answer.qid === question.qid))) invalidState();
      const release = acquire(`session:${id}`);
      let evaluating: SessionRecord;
      try {
        evaluating = await saveSession(request, session, { ...session, status: "EVALUATING", exam: { ...exam, status: "EVALUATING" } });
      } catch (error) { release(); throw error; }
      let committed = false;
      return stream(request, release, async (send) => {
        const grades: NonNullable<SessionRecord["exam"]>["grades"] = [];
        const gaps: SessionRecord["gaps"] = [];
        for await (const event of llm.gradeExam({
          chapter: session.chapter, questions: exam.questions,
          answers: exam.answers.map(({ qid, answer }) => ({ qid, answer })), taught: taughtMessages(session),
          persona: session.game?.character,
        })) {
          checkActive(request);
          const question = exam.questions.find((item) => item.qid === event.qid);
          if (!question) modelFailure();
          if (event.type === "grade") {
            if (grades.some((grade) => grade.qid === event.qid) || !Number.isInteger(event.score)
              || event.score < 0 || event.score > question.points || event.maxScore !== question.points
              || (question.choices && (event.score !== 0 && event.score !== question.points || event.verdict === "PARTIAL"))
              || event.verdict !== (event.score === question.points ? "CORRECT" : event.score === 0 ? "WRONG" : "PARTIAL")) modelFailure();
            const { qid, score, maxScore, verdict, comment } = event;
            const grade = { qid, score, maxScore, verdict, comment };
            grades.push(grade);
            send("grading", { qid });
            send("grade", grade);
          } else {
            if (gaps.some((gap) => gap.qid === event.qid)
              || !session.chapter.text.includes(event.sourceExcerpt) || !event.sourceExcerpt.trim()
              || (event.evidenceQuote && !taughtMessages(session).some((item) => item.content.includes(event.evidenceQuote)))) modelFailure();
            const { qid, title, diagnosis, evidenceQuote, concepts, sourceExcerpt } = event;
            const gap: GapDto = { gapId: `gap_${nanoid(14)}`, qid, title, diagnosis, evidenceQuote, concepts, sourceExcerpt, status: "FOUND", tutorMessages: [] };
            gaps.push({ ...gap, sourceOffset: session.chapter.startOffset + session.chapter.text.indexOf(sourceExcerpt) });
            send("gap", gap);
          }
        }
        if (grades.length !== exam.questions.length || grades.some((grade) =>
          gaps.filter((gap) => gap.qid === grade.qid).length !== (grade.verdict === "CORRECT" ? 0 : 1))) modelFailure();
        const totalScore = grades.reduce((sum, grade) => sum + grade.score, 0);
        if (totalScore > 100) modelFailure();
        const finalVerdict = finalVerdictFor(totalScore, gaps.length);
        await saveSession(request, evaluating, {
          ...evaluating, status: "RESULT_READY", error: null, score: totalScore, finalVerdict, gaps,
          exam: { ...exam, status: "GRADED", grades },
        });
        committed = true;
        send("result", { totalScore, finalVerdict, gapCount: gaps.length });
      }, async () => {
        if (!committed) await backend.commitSession(evaluating, { ...session, updatedAt: new Date().toISOString() });
      });
    },

    async tutor(request: Request, id: string): Promise<Response> {
      const session = await loadSession(request, id);
      const body = await readBody(request, TutorRequestSchema);
      if (!body.gapId.trim() || (body.content !== undefined && !body.content.trim())) {
        throw new RouteError(400, "VALIDATION", "되짚을 항목과 질문을 확인해 주세요.");
      }
      if (session.status !== "RESULT_READY" && session.status !== "REVIEWING") invalidState();
      const gap = session.gaps.find((item) => item.gapId === body.gapId);
      if (!gap) throw new RouteError(404, "NOT_FOUND", "되짚을 항목을 찾을 수 없습니다.");
      const release = acquire(`session:${id}`);
      return stream(request, release, async (send) => {
        const prompt = body.content ?? TUTOR_PRESET_REQUEST;
        let response: string | undefined;
        let streamed = "";
        for await (const event of llm.tutorExplain({ chapter: session.chapter, gap, request: prompt })) {
          checkActive(request);
          if (response !== undefined) modelFailure();
          if (event.type === "token") {
            streamed += event.token;
            for (const token of Array.from(event.token)) send("tutor.token", { token });
          } else response = event.response;
        }
        if (!response?.trim() || response !== streamed) modelFailure();
        const tutorMessage = { id: `tm_${nanoid(14)}`, request: prompt, response, createdAt: new Date().toISOString() };
        await saveSession(request, session, {
          ...session, error: null,
          gaps: session.gaps.map((item) => item.gapId === gap.gapId ? { ...item, tutorMessages: [...item.tutorMessages, tutorMessage] } : item),
        });
        send("tutor.message", { id: tutorMessage.id, gapId: gap.gapId, request: prompt, response });
      });
    },
  };

  // Keep pre-stream failures as ordinary contract-shaped HTTP errors. This
  // wrapper is also used by injected integration tests, not only Next routes.
  const wrap = (handler: (request: Request, id: string) => Promise<Response>) => async (request: Request, id: string) => {
    try { return await handler(request, id); } catch (error) { return failureResponse(error); }
  };
  return {
    generate: wrap(handlers.generate), prepare: wrap(handlers.prepare), explanations: wrap(handlers.explanations),
    answers: wrap(handlers.answers), evaluate: wrap(handlers.evaluate), tutor: wrap(handlers.tutor),
  };
}

export type DRouteName = keyof ReturnType<typeof createRouteHandlers>;

export async function runRoute(name: DRouteName, request: Request, id: string): Promise<Response> {
  try {
    const backend = await getRouteBackend();
    const { llm } = await import("@/lib/llm");
    return createRouteHandlers({ backend, llm })[name](request, id);
  } catch (error) { return failureResponse(error); }
}
