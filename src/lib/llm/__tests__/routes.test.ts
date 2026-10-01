import assert from "node:assert/strict";
import { test } from "node:test";
import osDemo from "../../../../fixtures/demo.os.json";
import { createRouteHandlers } from "../routes/handlers";
import { createStubBackend, D_STUB_IDS as ids } from "../routes/backend-stub";
import { RouteError, type RouteBackend } from "../routes/backend";
import { stubLlm } from "../stub";
import type { Llm, TaughtMsg } from "../types";

process.env.LLM_STUB_DELAY_MS = "0";

function request(body?: unknown, user: string | null = ids.user, method = "POST") {
  return new Request("http://localhost/api/d-test", {
    method,
    headers: { "content-type": "application/json", ...(user ? { cookie: `${process.env.SESSION_COOKIE || "tb_uid"}=${user}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

type WireEvent = { event: string; data: Record<string, unknown> };
async function events(response: Response): Promise<WireEvent[]> {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const text = await response.text();
  assert.ok(text.startsWith(": connected\n\n"));
  const parsed = text.split("\n\n").filter((block) => block.startsWith("event: ")).map((block) => {
    const lines = block.split("\n");
    return { event: lines[0].slice(7), data: JSON.parse(lines[1].slice(6)) as Record<string, unknown> };
  });
  assert.equal(parsed.at(-1)?.event, "done");
  assert.equal(parsed.filter((event) => event.event === "done").length, 1);
  return parsed;
}

function success(items: WireEvent[]) {
  assert.ok(!items.some((item) => item.event === "error"), JSON.stringify(items));
}

async function httpError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
}

async function session(backend: RouteBackend, id: string) {
  const value = await backend.getSession(id, ids.user);
  assert.ok(value);
  return value;
}

async function writeAllAnswers(handlers: ReturnType<typeof createRouteHandlers>) {
  for (const qid of ["q1", "q2", "q3"]) success(await events(await handlers.answers(request({ qid }), ids.examSession)));
}

test("pre-stream errors preserve HTTP 401/404/400/409 and frozen error codes", async () => {
  const handlers = createRouteHandlers({ backend: createStubBackend(), llm: stubLlm });
  await httpError(await handlers.prepare(request(undefined, null, "GET"), ids.prepareSession), 401, "UNAUTHORIZED");
  await httpError(await handlers.prepare(request(undefined, "usr_demo2", "GET"), ids.prepareSession), 404, "NOT_FOUND");
  await httpError(await handlers.prepare(request(undefined, ids.user, "GET"), "sess_missing"), 404, "NOT_FOUND");
  await httpError(await handlers.explanations(request({ content: " " }), ids.prepareSession), 400, "VALIDATION");
  await httpError(await handlers.explanations(request({ content: "a".repeat(2001) }), ids.prepareSession), 400, "VALIDATION");
  await httpError(await handlers.answers(request({ qid: "q_missing" }), ids.examSession), 404, "NOT_FOUND");
  await httpError(await handlers.prepare(request(undefined, ids.user, "GET"), ids.resultSession), 409, "INVALID_STATE");
  await httpError(await handlers.evaluate(request(), ids.examSession), 409, "INVALID_STATE");
});

test("generate persists chapters with valid offsets and only public chapter fields stream", async () => {
  const backend = createStubBackend();
  const handlers = createRouteHandlers({ backend, llm: stubLlm });
  const emitted = await events(await handlers.generate(request(), ids.pendingMaterial));
  success(emitted);
  const material = await backend.getMaterial(ids.pendingMaterial, ids.user);
  assert.ok(material);
  assert.equal(material.status, "READY");
  assert.equal(material.chapters.length, 8);
  let next = 0;
  for (const chapter of material.chapters) {
    assert.equal(chapter.startOffset, next);
    assert.ok(chapter.endOffset > chapter.startOffset);
    next = chapter.endOffset;
  }
  assert.equal(next, material.sources[0].text.length);
  const publicData = JSON.stringify(emitted.find((event) => event.event === "chapters"));
  assert.ok(!publicData.includes("sourceId") && !publicData.includes("startOffset"));
  await httpError(await handlers.generate(request(), ids.pendingMaterial), 409, "INVALID_STATE");
});

test("prepare refresh reuses exam/messages and never exposes rubric or source text", async () => {
  const backend = createStubBackend();
  let calls = 0;
  const model: Llm = { ...stubLlm, async prepareSession(input) { calls += 1; return stubLlm.prepareSession(input); } };
  const handlers = createRouteHandlers({ backend, llm: model });
  const first = await events(await handlers.prepare(request(undefined, ids.user, "GET"), ids.prepareSession));
  success(first);
  const prepared = await session(backend, ids.prepareSession);
  assert.equal(prepared.status, "EXPLAINING");
  assert.equal(prepared.exam?.questions.length, 3);
  assert.ok(prepared.exam?.questions.every((question) => question.rubric));
  const second = await events(await handlers.prepare(request(undefined, ids.user, "GET"), ids.prepareSession));
  assert.deepEqual(second.map((event) => event.event), ["ready", "done"]);
  assert.equal(calls, 1);
  assert.deepEqual(await session(backend, ids.prepareSession), prepared);
  assert.ok(!JSON.stringify([...first, ...second]).includes('"rubric"'));
  assert.ok(!JSON.stringify(first).includes(prepared.chapter.text));
});

test("wrong explanation ends in doubt without learned concepts; multiple reactions persist", async () => {
  const backend = createStubBackend();
  const handlers = createRouteHandlers({ backend, llm: stubLlm });
  success(await events(await handlers.prepare(request(undefined, ids.user, "GET"), ids.prepareSession)));
  const doubt = await events(await handlers.explanations(request({ content: osDemo.wrongExplanation }), ids.prepareSession));
  success(doubt);
  assert.ok(doubt.some((event) => event.event === "junior.doubt"));
  assert.ok(!doubt.some((event) => event.event === "junior.question" || event.event === "junior.message"));
  const afterDoubt = await session(backend, ids.prepareSession);
  assert.deepEqual(afterDoubt.heardConcepts, []);
  assert.equal(afterDoubt.messages.at(-1)?.stage, "DOUBT");

  const model: Llm = { ...stubLlm, async *juniorTurn() {
    yield { type: "concepts", heardConcepts: ["CPU 스케줄링"], added: ["CPU 스케줄링"] };
    yield { type: "reaction", content: "준비된 프로세스에서 고르는구나." };
    yield { type: "reaction", content: "CPU를 누구에게 줄지 정하는 거네." };
    yield { type: "question", content: "선점도 알려줄래?", coveredObjectives: ["o1"] };
  } };
  const reaction = await events(await createRouteHandlers({ backend, llm: model }).explanations(request({ content: osDemo.correctedExplanation }), ids.prepareSession));
  success(reaction);
  assert.equal(reaction.filter((event) => event.event === "junior.message").length, 2);
  assert.equal((await session(backend, ids.prepareSession)).messages.filter((message) => message.stage === "REACTION").length, 2);
});

test("failed explanation retains one USER message and retry reuses its messageId", async () => {
  const backend = createStubBackend();
  let fail = true;
  const model: Llm = { ...stubLlm, async *juniorTurn(input) {
    if (fail) throw new Error("simulated provider failure");
    yield* stubLlm.juniorTurn(input);
  } };
  const handlers = createRouteHandlers({ backend, llm: model });
  success(await events(await handlers.prepare(request(undefined, ids.user, "GET"), ids.prepareSession)));
  const first = await events(await handlers.explanations(request({ content: osDemo.correctedExplanation }), ids.prepareSession));
  assert.deepEqual(first.slice(-2).map((event) => event.event), ["error", "done"]);
  assert.equal(first.at(-2)?.data.code, "LLM_FAILED");
  const failed = await session(backend, ids.prepareSession);
  assert.equal(failed.status, "EXPLAINING");
  assert.equal(failed.messages.filter((message) => message.role === "USER").length, 1);
  fail = false;
  const retry = await events(await handlers.explanations(request({ content: osDemo.correctedExplanation }), ids.prepareSession));
  success(retry);
  assert.equal(retry.find((event) => event.event === "user.saved")?.data.messageId, first.find((event) => event.event === "user.saved")?.data.messageId);
  assert.equal((await session(backend, ids.prepareSession)).messages.filter((message) => message.role === "USER").length, 1);
});

test("answers omit excluded explanations, allow requested qid order, and reuse cached evidence", async () => {
  const backend = createStubBackend();
  const initial = await session(backend, ids.examSession);
  await backend.commitSession(initial, { ...initial, messages: initial.messages.map((message, index) => ({ ...message, excluded: index === 0 })) });
  let calls = 0;
  let evidence: TaughtMsg[] = [];
  const model: Llm = { ...stubLlm, async *writeExamAnswer(input) {
    calls += 1;
    evidence = input.taught;
    yield* stubLlm.writeExamAnswer(input);
  } };
  const handlers = createRouteHandlers({ backend, llm: model });
  const q2 = await events(await handlers.answers(request({ qid: "q2" }), ids.examSession));
  success(q2);
  assert.deepEqual(evidence.map((item) => item.ref), [1, 2]);
  assert.ok(evidence.every((item) => item.content !== osDemo.wrongExplanation));
  assert.ok(!JSON.stringify(q2).includes(osDemo.wrongExplanation));
  const cached = await events(await handlers.answers(request({ qid: "q2" }), ids.examSession));
  success(cached);
  assert.deepEqual(cached.map((event) => event.event), ["answer.recap", "answer.saved", "done"]);
  assert.equal(cached.find((event) => event.event === "answer.saved")?.data.cached, true);
  assert.equal(calls, 1);
  assert.equal((await session(backend, ids.examSession)).exam?.answers.length, 1);
  const q3 = await events(await handlers.answers(request({ qid: "q3" }), ids.examSession));
  success(q3);
  assert.ok(q3.some((event) => event.event === "answer.recall" && event.data.unlearned === true && event.data.ref === null));
  assert.ok(!q3.some((event) => event.event === "exam.completed"));
  const q1 = await events(await handlers.answers(request({ qid: "q1" }), ids.examSession));
  success(q1);
  assert.equal(q1.filter((event) => event.event === "exam.completed").length, 1);
});

test("grading rollback preserves completed answers and retry saves actual grades/gaps", async () => {
  const backend = createStubBackend();
  const normal = createRouteHandlers({ backend, llm: stubLlm });
  await writeAllAnswers(normal);
  const before = await session(backend, ids.examSession);
  const failing: Llm = { ...stubLlm, async *gradeExam(input) {
    for await (const event of stubLlm.gradeExam(input)) {
      yield event;
      throw new Error("failure after first grade");
    }
  } };
  const failed = await events(await createRouteHandlers({ backend, llm: failing }).evaluate(request(), ids.examSession));
  assert.deepEqual(failed.slice(-2).map((event) => event.event), ["error", "done"]);
  const restored = await session(backend, ids.examSession);
  assert.equal(restored.status, "EXAM_IN_PROGRESS");
  assert.equal(restored.exam?.status, "IN_PROGRESS");
  assert.deepEqual(restored.exam?.answers, before.exam?.answers);
  assert.deepEqual(restored.exam?.grades, []);
  assert.deepEqual(restored.gaps, []);
  const retry = await events(await normal.evaluate(request(), ids.examSession));
  success(retry);
  assert.equal(retry.filter((event) => event.event === "grade").length, 3);
  const result = await session(backend, ids.examSession);
  assert.equal(result.status, "RESULT_READY");
  assert.equal(result.exam?.status, "GRADED");
  assert.equal(result.score, 67);
  assert.equal(result.finalVerdict, "NEEDS_WORK");
  assert.equal(result.gaps.length, 1);
  assert.ok(result.chapter.text.includes(result.gaps[0].sourceExcerpt));
});

test("missing required P5 gap rejects the stream and restores pre-grading state", async () => {
  const backend = createStubBackend();
  await writeAllAnswers(createRouteHandlers({ backend, llm: stubLlm }));
  const incomplete: Llm = { ...stubLlm, async *gradeExam(input) {
    for await (const event of stubLlm.gradeExam(input)) if (event.type === "grade") yield event;
  } };
  const emitted = await events(await createRouteHandlers({ backend, llm: incomplete }).evaluate(request(), ids.examSession));
  assert.equal(emitted.at(-2)?.event, "error");
  const restored = await session(backend, ids.examSession);
  assert.equal(restored.status, "EXAM_IN_PROGRESS");
  assert.equal(restored.exam?.grades.length, 0);
  assert.equal(restored.gaps.length, 0);
});

test("overlapping prepare requests return 409 and do not create duplicate exams", async () => {
  const backend = createStubBackend();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const model: Llm = { ...stubLlm, async prepareSession(input) {
    calls += 1;
    await gate;
    return stubLlm.prepareSession(input);
  } };
  const handlers = createRouteHandlers({ backend, llm: model });
  const first = await handlers.prepare(request(undefined, ids.user, "GET"), ids.prepareSession);
  try {
    await httpError(await handlers.prepare(request(undefined, ids.user, "GET"), ids.prepareSession), 409, "INVALID_STATE");
  } finally { release(); }
  success(await events(first));
  assert.equal(calls, 1);
  assert.equal((await session(backend, ids.prepareSession)).messages.length, 1);
});

test("stub persistence rejects stale writes and never returns another owner's session", async () => {
  const backend = createStubBackend();
  const previous = await session(backend, ids.prepareSession);
  const saved = await backend.commitSession(previous, { ...previous, heardConcepts: ["보존할 변경"] });
  await assert.rejects(backend.commitSession(previous, { ...previous, heardConcepts: ["오래된 변경"] }), (error: unknown) => {
    assert.ok(error instanceof RouteError);
    assert.equal(error.status, 409);
    return true;
  });
  assert.deepEqual(await session(backend, ids.prepareSession), saved);
  assert.equal(await backend.getSession(ids.prepareSession, "usr_demo2"), null);
});

test("tutor streams characters then persists the exact assembled response", async () => {
  const backend = createStubBackend();
  const initial = await session(backend, ids.resultSession);
  const gapId = initial.gaps[0].gapId;
  const emitted = await events(await createRouteHandlers({ backend, llm: stubLlm }).tutor(request({ gapId }), ids.resultSession));
  success(emitted);
  const tokens = emitted.filter((event) => event.event === "tutor.token");
  assert.ok(tokens.length > 0 && tokens.every((event) => Array.from(String(event.data.token)).length === 1));
  const response = tokens.map((event) => event.data.token).join("");
  assert.equal(emitted.find((event) => event.event === "tutor.message")?.data.response, response);
  assert.equal((await session(backend, ids.resultSession)).gaps[0].tutorMessages[0].response, response);
});
