import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import chapters from "../../../../fixtures/chapters.economics.json";
import osNotes from "../fixtures/teacher-notes.os.json";
import econNotes from "../fixtures/teacher-notes.econ.json";
import materials from "../../../../prisma/seed-data/materials.json";
import { CHARACTERS, FINAL_QUESTION_COUNT, isObjectiveQuestion, pointsPlan, type JuniorCharacter } from "@/contracts/game";
import { PERSONAS } from "../personas";
import { teacherNoteSchema, prepareSessionSchema, prepareSessionSchemaFor } from "../schemas";
import { stubLlm } from "../stub";
import { createLiveLlm } from "../live";
import { createRouteHandlers } from "../routes/handlers";
import { createDefaultStubSeed, createStubBackend, D_STUB_IDS } from "../routes/backend-stub";
import { DEMO_WRONG_EXPLANATION, DEMO_PARTIAL_EXPLANATION, DEMO_COMPLETE_EXPLANATION } from "../fixtures/demo-script";
import type { ChapterText } from "../types";

process.env.LLM_STUB_DELAY_MS = "0";
const source = readFileSync(new URL("../../../../fixtures/economics.md", import.meta.url), "utf8");
const selected = chapters.chapters[0];
const chapter: ChapterText = { title: "수요의 이해", points: ["수요량과 수요", "수요 법칙", "곡선 위 이동 vs 이동"],
  text: source.slice(selected.startOffset, selected.endOffset) };

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of iterable) result.push(event);
  return result;
}

async function score(taught: string, persona: JuniorCharacter): Promise<number> {
  const spec = CHARACTERS[persona];
  const prepared = prepareSessionSchema.parse(await stubLlm.prepareSession({ chapter, level: spec.level, persona, examFormat: spec.examFormat }));
  const messages = [{ ref: 1, content: taught }];
  const answers = [];
  for (const question of prepared.questions) {
    const events = await collect(stubLlm.writeExamAnswer({ question: question.question, choices: question.choices, persona,
      taught: messages, heardConcepts: chapter.points }));
    const final = events.find((event) => event.type === "final");
    assert.ok(final?.type === "final");
    if (question.choices) assert.ok(question.choices.some((choice) => final.answer.startsWith(choice.slice(0, 1))));
    answers.push({ qid: question.qid, answer: final.answer });
  }
  const events = await collect(stubLlm.gradeExam({ chapter, questions: prepared.questions, answers, taught: messages, persona }));
  const grades = events.filter((event) => event.type === "grade");
  const gaps = events.filter((event) => event.type === "gap");
  assert.equal(grades.length, 3);
  assert.equal(gaps.length, grades.filter((event) => event.verdict !== "CORRECT").length);
  return grades.reduce((sum, event) => sum + event.score, 0);
}

test("character contracts and all eleven seeded teacher notes agree", async () => {
  for (const character of Object.keys(CHARACTERS) as JuniorCharacter[]) {
    assert.equal(PERSONAS[character].passScore, CHARACTERS[character].passScore);
    assert.equal(PERSONAS[character].examFormat, CHARACTERS[character].examFormat);
  }
  const titles = materials.flatMap((material) => material.chapters.map((item) => item.title));
  assert.deepEqual(new Set([...Object.keys(osNotes), ...Object.keys(econNotes)]), new Set(titles));
  const note = await stubLlm.generateTeacherNote({ chapter });
  assert.deepEqual(note, econNotes["수요의 이해"]);
  teacherNoteSchema.parse(note);
  const script = readFileSync(new URL("../../../../docs/llm-personas.md", import.meta.url), "utf8");
  for (const line of [DEMO_WRONG_EXPLANATION, DEMO_PARTIAL_EXPLANATION, DEMO_COMPLETE_EXPLANATION])
    assert.ok(script.includes(line), "시연 대본과 stub 입력 문장이 일치해야 합니다.");
});

test("KU asks about the mistaken demand explanation without learning it", async () => {
  const prepared = await stubLlm.prepareSession({ chapter, level: "HARD", persona: "KU_HARD" });
  const events = await collect(stubLlm.juniorTurn({ chapter, level: "HARD", persona: "KU_HARD", objectives: prepared.objectives,
    heardConcepts: [], history: [], explanation: DEMO_WRONG_EXPLANATION }));
  assert.deepEqual(events[0], { type: "concepts", heardConcepts: [], added: [] });
  assert.deepEqual(events[1], { type: "doubt", content: PERSONAS.KU_HARD.examples.doubt });
});

test("demo partial teaching scores 58 and complete teaching scores 100", async () => {
  assert.equal(await score(DEMO_PARTIAL_EXPLANATION, "KU_HARD"), 58);
  assert.equal(await score(DEMO_COMPLETE_EXPLANATION, "KU_HARD"), 100);
});

test("three personas have distinct exam behavior and pass thresholds", async () => {
  for (const persona of Object.keys(CHARACTERS) as JuniorCharacter[]) {
    const spec = CHARACTERS[persona];
    const prepared = prepareSessionSchema.parse(await stubLlm.prepareSession({ chapter, level: spec.level, persona }));
    assert.equal(prepared.questions.every((question) => Boolean(question.choices)), spec.examFormat === "OBJECTIVE");
    assert.equal((await score(DEMO_COMPLETE_EXPLANATION, persona)) >= spec.passScore, true);
    assert.equal((await score("아직 잘 모르겠어.", persona)) < spec.passScore, true);
  }
  assert.ok((await score(DEMO_WRONG_EXPLANATION, "MALE_EASY")) < CHARACTERS.MALE_EASY.passScore);
});

test("route handlers pass game persona to preparation and allow KU's doubt", async () => {
  const seed = createDefaultStubSeed();
  const session = seed.sessions.find((item) => item.sessionId === D_STUB_IDS.economicsPrepareSession)!;
  session.juniorLevel = "HARD";
  session.game = { runId: "run_demo", character: "KU_HARD", lives: 1, maxLives: 3,
    passScore: 80, examFormat: "DESCRIPTIVE", mastery: [] };
  const backend = createStubBackend(seed);
  const handlers = createRouteHandlers({ backend, llm: stubLlm });
  const request = (body?: object) => new Request("http://localhost/api/test", {
    method: "POST", headers: { cookie: `tb_uid=${D_STUB_IDS.user}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const prepared = await handlers.prepare(request(), session.sessionId);
  assert.equal(prepared.status, 200);
  assert.doesNotMatch(await prepared.text(), /event: error/u);
  const turn = await handlers.explanations(request({ content: DEMO_WRONG_EXPLANATION }), session.sessionId);
  assert.equal(turn.status, 200);
  const stream = await turn.text();
  assert.match(stream, /event: junior\.doubt/u);
  assert.doesNotMatch(stream, /event: error/u);
  assert.equal((await backend.getSession(session.sessionId, D_STUB_IDS.user))?.messages.at(-1)?.stage, "DOUBT");
});

test("objective route stores four choices, cited selections, and binary grades", async () => {
  const seed = createDefaultStubSeed();
  const session = seed.sessions.find((item) => item.sessionId === D_STUB_IDS.examSession)!;
  session.game = { runId: "run_male", character: "MALE_EASY", lives: 3, maxLives: 3,
    passScore: 60, examFormat: "OBJECTIVE", mastery: [] };
  session.exam!.questions = (await stubLlm.prepareSession({ chapter: session.chapter, level: "EASY", persona: "MALE_EASY" })).questions;
  const backend = createStubBackend(seed);
  const handlers = createRouteHandlers({ backend, llm: stubLlm });
  const request = (body?: object) => new Request("http://localhost/api/test", {
    method: "POST", headers: { cookie: `tb_uid=${D_STUB_IDS.user}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const qid of ["q1", "q2", "q3"]) {
    const response = await handlers.answers(request({ qid }), session.sessionId);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /event: error/u);
  }
  const evaluated = await handlers.evaluate(request(), session.sessionId);
  assert.equal(evaluated.status, 200);
  assert.doesNotMatch(await evaluated.text(), /event: error/u);
  const saved = await backend.getSession(session.sessionId, D_STUB_IDS.user);
  assert.ok(saved?.exam?.questions.every((question) => question.choices?.length === 4));
  assert.ok(saved?.exam?.answers.every((answer) => /^[①②③④]/u.test(answer.answer)));
  assert.ok(saved?.exam?.grades.every((grade) => grade.verdict === "CORRECT" || grade.verdict === "WRONG"));
  assert.equal(saved?.gaps.length, saved?.exam?.grades.filter((grade) => grade.verdict === "WRONG").length);
});

test("live objective grading skips the model for a correct choice and diagnoses a wrong one", async () => {
  let calls = 0;
  const llm = createLiveLlm({
    async completeJSON(_system, _user, schema) {
      calls += 1;
      return schema.parse({ gap: { title: "수요 법칙", diagnosis: "배운 근거가 부족합니다.", evidenceQuote: "",
        concepts: ["수요 법칙"], sourceExcerpt: chapter.text.slice(0, 40) } });
    },
    async *streamText() { throw new Error("Unexpected text call"); },
  });
  const question = { qid: "q1", question: "수요 법칙은?", points: 34, rubric: "정답 ②;근거: 자료의 가격과 수요량 관계",
    choices: ["① 늘어난다", "② 줄어든다", "③ 같다", "④ 알 수 없다"] };
  const correct = await collect(llm.gradeExam({ chapter, questions: [question], answers: [{ qid: "q1", answer: "② 배운 내용" }], taught: [] }));
  assert.equal(calls, 0);
  assert.deepEqual(correct.map((event) => event.type), ["grade"]);
  const wrong = await collect(llm.gradeExam({ chapter, questions: [question], answers: [{ qid: "q1", answer: "① 모르겠어요" }], taught: [] }));
  assert.equal(calls, 1);
  assert.deepEqual(wrong.map((event) => event.type), ["grade", "gap"]);
  assert.ok(wrong[0].type === "grade" && wrong[0].score === 0 && wrong[0].verdict === "WRONG");
});

test("question counts follow the junior (3 objective / 5 / 7 descriptive) and the final exam mixes 10", async () => {
  for (const persona of Object.keys(CHARACTERS) as JuniorCharacter[]) {
    const spec = CHARACTERS[persona];
    const count = spec.questionCount;
    const indexes = Array.from({ length: count }, (_, i) => i).filter((i) => isObjectiveQuestion(spec.examFormat, i, count));
    const prepared = prepareSessionSchemaFor(count, indexes).parse(await stubLlm.prepareSession({
      chapter, level: spec.level, persona, examFormat: spec.examFormat, questionCount: count, kind: "CHAPTER" }));
    assert.equal(prepared.questions.length, count);
    assert.equal(prepared.questions.reduce((sum, q) => sum + q.points, 0), 100);
  }
  assert.deepEqual([CHARACTERS.MALE_EASY.questionCount, CHARACTERS.FEMALE_NORMAL.questionCount, CHARACTERS.KU_HARD.questionCount], [3, 5, 7]);
  const indexes = Array.from({ length: FINAL_QUESTION_COUNT }, (_, i) => i).filter((i) => isObjectiveQuestion("MIXED", i, FINAL_QUESTION_COUNT));
  const final = prepareSessionSchemaFor(FINAL_QUESTION_COUNT, indexes).parse(await stubLlm.prepareSession({
    chapter, level: "HARD", persona: "KU_HARD", examFormat: "MIXED", questionCount: FINAL_QUESTION_COUNT, kind: "FINAL" }));
  assert.equal(final.questions.length, 10);
  assert.deepEqual(final.questions.map((q) => q.points), pointsPlan(10));
  assert.equal(final.questions.filter((q) => q.choices).length, 5);
  assert.equal(final.questions.filter((q) => !q.choices).length, 5);
});
