import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import chapters from "../../../../fixtures/chapters.economics.json";
import { CHARACTERS } from "@/contracts/game";
import { stubLlm } from "../stub";
import { createLiveLlm } from "../live";
import { normalizePersonaAddress, PERSONAS } from "../personas";
import { teachingChoicesFor, teachingFactFor, selectedTeachingObjective, teachingDistractorsSchema } from "../teaching-choices";
import { sourceLearningConcepts } from "../learning-plan";
import { createRouteHandlers } from "../routes/handlers";
import { createDefaultStubSeed, createStubBackend, D_STUB_IDS } from "../routes/backend-stub";
import type { Llm } from "../types";

process.env.LLM_STUB_DELAY_MS = "0";
const source = readFileSync(new URL("../../../../fixtures/economics.md", import.meta.url), "utf8");
const first = chapters.chapters[0];
const chapter = { ...first, text: source.slice(first.startOffset, first.endOffset) };
async function collect<T>(iterable: AsyncIterable<T>) { const result: T[] = []; for await (const event of iterable) result.push(event); return result; }
const request = (content?: string) => new Request("http://localhost/api/test", { method: content ? "POST" : "GET",
  headers: { cookie: `tb_uid=${D_STUB_IDS.user}`, "content-type": "application/json" }, ...(content ? { body: JSON.stringify({ content }) } : {}),
});

function maleBackend() {
  const seed = createDefaultStubSeed();
  const session = seed.sessions.find((item) => item.sessionId === D_STUB_IDS.economicsPrepareSession)!;
  session.game = { runId: "run_teaching", character: "MALE_EASY", lives: 3, maxLives: 3, passScore: 60, examFormat: "OBJECTIVE", mastery: [] };
  const backend = createStubBackend(seed);
  return { backend, handlers: createRouteHandlers({ backend, llm: stubLlm }), id: session.sessionId };
}

test("source-grounded teaching options are distinct from exam options and carry no answer key", async () => {
  const options = teachingChoicesFor(chapter, "수요 법칙");
  assert.ok(options.length >= 2);
  const statement = options.find((choice) => choice.id === "teach_statement")!;
  assert.ok(chapter.text.includes(statement.text));
  assert.equal(options.length, 4);
  assert.ok(options.filter((choice) => choice.id !== "teach_statement").every((choice) => choice.text !== statement.text && choice.text.includes("수요 법칙")));
  assert.ok(options.every((choice) => !/맞지 않|모르겠|옳지 않/u.test(choice.text)));
  for (const choice of options) assert.deepEqual(Object.keys(choice).sort(), ["id", "text"]);
  for (const persona of ["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const) {
    const prepared = await stubLlm.prepareSession({ chapter, level: CHARACTERS[persona].level, persona });
    if (persona === "KU_HARD") assert.match(prepared.firstQuestion, /선배(?!님)/u);
    else assert.doesNotMatch(prepared.firstQuestion, /선배님?[,.~]/u);
    assert.equal(prepared.objectives.length, 5);
    assert.equal(prepared.questions.length, 5);
    assert.equal(Boolean(prepared.firstTeachingChoices), persona === "MALE_EASY");
    assert.equal(prepared.questions.every((question) => question.choices?.length === 4), persona === "MALE_EASY");
  }
});

test("male choice uses the existing USER answer pipeline, accepts wrong teaching and retains it in the exam", async () => {
  const { backend, handlers, id } = maleBackend();
  assert.doesNotMatch(await (await handlers.prepare(request(), id)).text(), /event: error/u);
  const prepared = (await backend.getSession(id, D_STUB_IDS.user))!;
  const wrong = prepared.messages.at(-1)!.teachingChoices!.find((choice) => choice.id === "teach_alternative")!.text;
  const stream = await (await handlers.explanations(request(wrong), id)).text();
  assert.match(stream, /event: junior.message/u);
  assert.doesNotMatch(stream, /event: junior.doubt|event: error/u);
  const taught = (await backend.getSession(id, D_STUB_IDS.user))!;
  assert.equal(taught.messages.find((message) => message.role === "USER")?.content, wrong);
  assert.ok(taught.heardConcepts.length > 0);
  assert.equal(taught.game?.mastery[0].mastery, 100);
  const question = taught.exam!.questions[0];
  const answerEvents = await collect(stubLlm.writeExamAnswer({ question: question.question, choices: question.choices,
    heardConcepts: taught.heardConcepts, persona: "MALE_EASY", taught: [{ ref: 1, content: wrong }] }));
  const answer = answerEvents.find((event) => event.type === "final")!;
  assert.match(answer.answer, /^[1-4]번$/u);
  assert.ok(answerEvents.some((event) => event.type === "sources" && event.sources.some((source) => source.content === wrong)));
  const sentences = answerEvents.flatMap((event) => event.type === "sentence" ? [{ sentence: event.text, ref: event.ref, level: event.level, unlearned: event.unlearned }] : []);
  const grades = await collect(stubLlm.gradeExam({ chapter: taught.chapter, questions: [question], answers: [{ qid: question.qid, answer: answer.answer, sentences }], taught: [{ ref: 1, content: wrong }] }));
  assert.ok(grades[0].type === "grade" && grades[0].verdict === "WRONG");
  const direct = await (await handlers.explanations(request("다른 조건이 일정할 때 가격이 오르면 수요량은 줄어든다."), id)).text();
  assert.doesNotMatch(direct, /event: error/u);
});

test("resumed legacy male question is enriched once without recreating the exam or messages", async () => {
  const { backend, handlers, id } = maleBackend();
  await (await handlers.prepare(request(), id)).text();
  const before = (await backend.getSession(id, D_STUB_IDS.user))!;
  await backend.commitSession(before, { ...before, messages: before.messages.map((message) => { const legacy = { ...message }; delete legacy.teachingChoices; return legacy; }) });
  const once = await (await handlers.prepare(request(), id)).text();
  assert.doesNotMatch(once, /event: error/u);
  const restored = (await backend.getSession(id, D_STUB_IDS.user))!;
  assert.deepEqual(restored.exam, before.exam);
  assert.equal(restored.messages.length, before.messages.length);
  assert.deepEqual(restored.messages.at(-1)?.teachingChoices, before.messages.at(-1)?.teachingChoices);
  await (await handlers.prepare(request(), id)).text();
  assert.deepEqual((await backend.getSession(id, D_STUB_IDS.user))!.messages, restored.messages);
});

test("KU requires distinct repeated explanations while female remembers one clear explanation and asks why", async () => {
  const prepared = await stubLlm.prepareSession({ chapter, level: "HARD", persona: "KU_HARD" });
  const explanation = "다른 조건이 일정할 때 가격이 오르면 수요량은 줄어든다.";
  const base: Parameters<Llm["juniorTurn"]>[0] = { chapter, objectives: prepared.objectives, level: "HARD", persona: "KU_HARD", explanation, history: [], heardConcepts: [] };
  const firstTurn = await collect(stubLlm.juniorTurn(base));
  const question = firstTurn.find((event) => event.type === "question")!;
  assert.equal(question.mastery?.[0].mastery, 50);
  assert.deepEqual(question.coveredObjectives, []);
  assert.match(question.content, /다른 말로|다시|한 번 더/u);
  const history: typeof base.history = [{ role: "USER", stage: "ANSWER", content: explanation }];
  const duplicate = (await collect(stubLlm.juniorTurn({ ...base, history, mastery: question.mastery }))).find((event) => event.type === "question")!;
  assert.equal(duplicate.mastery?.[0].mastery, 50);
  const repeat = (await collect(stubLlm.juniorTurn({ ...base, history, mastery: question.mastery, explanation: "가격이 올라가면 수요량은 감소하고 가격이 내려가면 수요량은 늘어나는 반대 관계야." }))).find((event) => event.type === "question")!;
  assert.equal(repeat.mastery?.[0].mastery, 100);
  assert.deepEqual(repeat.coveredObjectives, ["o1"]);
  const female = (await collect(stubLlm.juniorTurn({ ...base, level: "EASY", persona: "FEMALE_NORMAL" }))).find((event) => event.type === "question")!;
  assert.equal(female.mastery?.[0].mastery, 100);
  assert.deepEqual(female.coveredObjectives, ["o1"]);
  assert.match(female.content, /의미와 이유/u);
  assert.doesNotMatch(female.content, /선배님/u);
  assert.equal(female.teachingChoices, undefined);
});

test("live male learns source contradictions without passing the source or alternatives into junior response", async () => {
  const explanation = "가격이 오르면 수요량도 늘어난다.";
  const objectives = [{ id: "o1", text: "수요 법칙을 설명할 수 있다" }, { id: "o2", text: "수요량의 변화를 설명할 수 있다" }];
  const llm = createLiveLlm({ async completeJSON(_prompt, user, schema) {
    const input = JSON.parse(user);
    if (input.statement) return schema.parse({ distractors: [] });
    if (input.chapter) return schema.parse({ concepts: [{ name: "수요 법칙", quote: explanation }], contradictions: [{ claim: explanation }],
      coverage: [{ id: "o1", evidence: [{ ref: input.currentRef, quote: explanation }] }], reactionQuote: "" });
    assert.equal(input.chapter, undefined);
    assert.equal(input.teachingChoices, undefined);
    assert.deepEqual(input.analysis.contradictionClaims, []);
    return schema.parse({ reactions: ["선배, 그렇게 기억할게요!"], question: "선배, 다음 개념은요?" });
  }, async *streamText() { throw new Error("unused"); } });
  const events = await collect(llm.juniorTurn({ chapter, level: "EASY", persona: "MALE_EASY", objectives, history: [], heardConcepts: [], explanation }));
  assert.ok(events.some((event) => event.type === "concepts" && event.heardConcepts.includes("수요 법칙")));
  // Human juniors retain what was taught without adding an address or correcting it.
  assert.ok(events.some((event) => event.type === "reaction" && event.content === PERSONAS.MALE_EASY.examples.reaction));
  assert.ok(!events.some((event) => event.type === "reaction" && /선배/u.test(event.content)));
  assert.ok(!events.some((event) => event.type === "doubt"));
  assert.ok(events.some((event) => event.type === "question" && event.teachingChoices?.length));
});

test("persona address correction preserves quoted USER text", () => {
  const quoted = '“선배가 틀렸어”';
  assert.equal(normalizePersonaAddress(`선배, ${quoted}라고 들었어요.`, "MALE_EASY"), `선배님, ${quoted}라고 들었어요.`);
  assert.equal(normalizePersonaAddress("선배님, 다시 설명해줘.", "KU_HARD"), "선배, 다시 설명해줘.");
});


test("choosing unknown keeps the current topic unlearned in both stub and live paths", async () => {
  const { backend, handlers, id } = maleBackend();
  await (await handlers.prepare(request(), id)).text();
  const prepared = (await backend.getSession(id, D_STUB_IDS.user))!;
  const explanation = "수요 법칙에 대해서는 아직 잘 모르겠어요.";
  await (await handlers.explanations(request(explanation), id)).text();
  const next = (await backend.getSession(id, D_STUB_IDS.user))!;
  assert.deepEqual(next.heardConcepts, []);
  assert.deepEqual(next.game?.mastery, []);
  assert.deepEqual(next.messages.at(-1)?.teachingChoices, prepared.messages.at(-1)?.teachingChoices);
  const llm = createLiveLlm({ async completeJSON(_prompt, user, schema) {
    const input = JSON.parse(user);
    return schema.parse(input.chapter ? {
      concepts: [{ name: "수요 법칙", quote: explanation }], contradictions: [],
      coverage: [{ id: "o1", evidence: [{ ref: input.currentRef, quote: explanation }] }], reactionQuote: "",
    } : { reactions: ["선배, 다 이해했어요!"], question: "다음 개념은요?" });
  }, async *streamText() { throw new Error("unused"); } });
  const events = await collect(llm.juniorTurn({ chapter, level: "EASY", persona: "MALE_EASY", objectives: prepared.objectives,
    explanation, history: [], heardConcepts: [] }));
  assert.deepEqual(events.find((event) => event.type === "concepts")?.heardConcepts, []);
  assert.deepEqual(events.find((event) => event.type === "question")?.coveredObjectives, []);
  assert.ok(events.some((event) => event.type === "reaction" && event.content.includes("아직 배우지 않은")));
});

test("stub objective answers follow taught statements regardless of option position and unknown voice follows persona", async () => {
  const content = "다른 조건이 일정할 때 가격이 오르면 수요량은 줄어든다.";
  const events = await collect(stubLlm.writeExamAnswer({ question: "가격과 수요량의 관계는?", choices: [
    `① ${content}`, "② 가격이 오르면 수요량은 늘어난다.", "③ 수요량은 변하지 않는다.", "④ 가격과 수요량은 아무 관계가 없다.",
  ], taught: [{ ref: 1, content }], heardConcepts: [], persona: "MALE_EASY" }));
  const answer = events.find((event) => event.type === "final")!;
  assert.equal(answer.answer, "1번");
  const unknown = (await collect(stubLlm.writeExamAnswer({ question: "모르는 개념은?", taught: [], heardConcepts: [], persona: "FEMALE_NORMAL" }))).find((event) => event.type === "final")!;
  assert.equal(unknown.answer, "모르겠습니다.");
  assert.doesNotMatch(unknown.answer, /선배/u);
});

test("overlapping objective names preserve the specific legacy question and credit the selected topic", async () => {
  const { backend, handlers, id } = maleBackend();
  await (await handlers.prepare(request(), id)).text();
  const before = (await backend.getSession(id, D_STUB_IDS.user))!;
  const objectives = [
    { id: "o1", text: "프로세스를 설명할 수 있다" },
    { id: "o2", text: "프로세스 상태를 설명할 수 있다" },
    { id: "o3", text: "스레드를 설명할 수 있다" },
  ];
  await backend.commitSession(before, { ...before, objectives, chapter: { ...before.chapter,
    title: "프로세스", points: ["프로세스", "프로세스 상태", "스레드"],
    text: "프로세스는 실행 중인 프로그램이다. 프로세스 상태는 준비, 실행, 대기 상태로 나뉜다. 스레드는 프로세스 안의 실행 단위이다.",
  }, messages: before.messages.map((message) => {
    const legacy = { ...message, content: "선배님, 프로세스 상태에 대해 알려주세요." };
    delete legacy.teachingChoices;
    return legacy;
  }) });
  await (await handlers.prepare(request(), id)).text();
  const resumed = (await backend.getSession(id, D_STUB_IDS.user))!;
  assert.match(resumed.messages.at(-1)!.content, /프로세스 상태에 대해/u);
  const selected = resumed.messages.at(-1)!.teachingChoices!.find((choice) => choice.id === "teach_statement")!.text;
  assert.match(selected, /프로세스 상태/u);
  const stream = await (await handlers.explanations(request(selected), id)).text();
  assert.doesNotMatch(stream, /event: error/u);
  const taught = (await backend.getSession(id, D_STUB_IDS.user))!;
  assert.deepEqual(taught.game!.mastery.map((entry) => entry.concept), ["프로세스 상태"]);
  assert.deepEqual(taught.heardConcepts, ["프로세스 상태"]);
  assert.match(stream, /"coveredObjectives":\["o2"\]/u);
});

test("an unrelated fallback source sentence does not automatically master the requested topic", async () => {
  const unrelated = { title: "프로세스", points: ["스레드"], text: "프로세스는 실행 중인 프로그램이며 독립적인 주소 공간을 가진다." };
  assert.deepEqual(teachingChoicesFor(unrelated, "스레드"), []);
  const selected = unrelated.text;
  const events = await collect(stubLlm.juniorTurn({ chapter: unrelated, level: "EASY", persona: "MALE_EASY",
    objectives: [{ id: "o1", text: "스레드를 설명할 수 있다" }], heardConcepts: [], explanation: selected,
    history: [{ role: "JUNIOR", stage: "QUESTION", content: "선배님, 스레드에 대해 어떤 내용으로 알려주실 건가요?" }],
  }));
  assert.deepEqual(events.find((event) => event.type === "concepts")?.heardConcepts, []);
  assert.deepEqual(events.find((event) => event.type === "question")?.coveredObjectives, []);
  assert.deepEqual(events.find((event) => event.type === "question")?.mastery, []);
});

test("OS unknown teaching is never exam evidence or credit even when the guessed option matches the key", async () => {
  const metadata = JSON.parse(readFileSync(new URL("../../../../fixtures/chapters.os.json", import.meta.url), "utf8"));
  const osSource = readFileSync(new URL("../../../../fixtures/operating-systems.md", import.meta.url), "utf8");
  const first = metadata.chapters[0];
  const osChapter = { ...first, text: osSource.slice(first.startOffset, first.endOffset) };
  const prepared = await stubLlm.prepareSession({ chapter: osChapter, level: "EASY", persona: "MALE_EASY" });
  const unknown = "선점과 비선점에 대해서는 아직 잘 모르겠어요.";
  const question = prepared.questions[1];
  const input = { question: question.question, choices: question.choices, persona: "MALE_EASY" as const,
    heardConcepts: [], taught: [{ ref: 7, content: unknown }] };
  const live = createLiveLlm({ async completeJSON(_prompt, _input, schema) {
    return schema.parse({ gap: { title: "미학습", diagnosis: "아직 설명을 듣지 못했습니다.", evidenceQuote: "",
      concepts: ["선점과 비선점"], sourceExcerpt: osChapter.text.slice(0, 40) } });
  }, async *streamText() { throw new Error("unused"); } });
  for (const llm of [stubLlm, live]) {
    const events = await collect(llm.writeExamAnswer(input));
    assert.deepEqual(events.find((event) => event.type === "sources")?.sources, []);
    const sentence = events.find((event) => event.type === "sentence")!;
    assert.equal(sentence.unlearned, true);
    assert.equal(sentence.ref, null);
    assert.equal(sentence.level, "NONE");
    const answer = events.find((event) => event.type === "final")!.answer;
    assert.equal(answer, "1번");
    for (const rubric of [question.rubric, "정답 ①;근거: 자료의 사실"]) {
      const grade: { score: number; verdict: string } = (await collect(llm.gradeExam({ chapter: osChapter, questions: [{ ...question, rubric }],
        answers: [{ qid: question.qid, answer, sentences: [{ sentence: sentence.text, ref: sentence.ref, level: sentence.level, unlearned: sentence.unlearned }] }], taught: input.taught }))).find((event) => event.type === "grade")!;
      assert.equal(grade.score, 0);
      assert.equal(grade.verdict, "WRONG");
    }
  }
});


test("teaching choices omit material directions and favor substantive explanations without inventing coverage", () => {
  const options = teachingChoicesFor(chapter, "수요 결정요인");
  const statement = options.find((choice) => choice.id === "teach_statement")!.text;
  assert.ok(chapter.text.includes(statement));
  assert.doesNotMatch(statement, /이 장의 설명 목표|학습 목표|자료는/u);
  assert.match(statement, /소득.*기호/u, "source explanation of concrete conditions is preferred to a generic definition");
  const automatic = selectedTeachingObjective({ chapter, level: "EASY", persona: "MALE_EASY",
    objectives: [{ id: "o1", text: "수요 결정요인을 설명할 수 있다" }], heardConcepts: [], explanation: statement,
    history: [{ role: "JUNIOR", stage: "QUESTION", content: "선배님, 수요 결정요인에 대해 알려주세요." }],
  });
  assert.equal(automatic, "o1", "a selected substantive explanation is recorded as taught, without judging correctness");
  assert.match(teachingChoicesFor(chapter, "수요 법칙").find((choice) => choice.id === "teach_statement")!.text, /^수요 법칙은 다른 조건이 일정할 때/u);
  const directionsOnly = { title: "수업 안내", points: ["프로세스"],
    text: "이 장의 설명 목표는 프로세스와 프로세스 상태를 서로 구별하는 것이다. 이 자료는 관련 개념을 익히기 위해 작성한 강의노트다." };
  assert.deepEqual(teachingChoicesFor(directionsOnly, "프로세스"), [], "no fallback may reintroduce excluded directions as teachable facts");
});

test("live objective grading rejects a guessed choice even with a longer persona-normalized answer", async () => {
  const llm = createLiveLlm({ async completeJSON(_prompt, _input, schema) {
    return schema.parse({ gap: { title: "미학습", diagnosis: "아직 설명을 듣지 못했습니다.", evidenceQuote: "",
      concepts: ["수요 법칙"], sourceExcerpt: chapter.text.slice(0, 40) } });
  }, async *streamText() { throw new Error("unused"); } });
  for (const address of ["선배한테", "선배님께"]) {
    const answer = `① 이 부분은 ${address} 못 들어서 모르겠습니다. 다른 내용은 배웠습니다.`;
    const events = await collect(llm.gradeExam({ chapter, taught: [],
      questions: [{ qid: "q1", question: "가격과 수요량의 관계는?", points: 100,
        rubric: "정답 ①;근거: 가격이 오르면 수요량은 줄어든다", choices: ["① 감소", "② 증가", "③ 일정", "④ 무관"] }],
      answers: [{ qid: "q1", answer }],
    }));
    const grade = events.find((event) => event.type === "grade")!;
    assert.equal(grade.score, 0);
    assert.equal(grade.verdict, "WRONG");
  }
});

test("human juniors keep a wrong readiness explanation and move on even if the model tries to correct it", async () => {
  const explanation = "준비 상태는 입출력이 끝나기를 기다리는 상태야.";
  const readiness = { title: "프로세스 상태", points: ["준비 상태", "CPU 스케줄링"],
    text: "준비 상태는 CPU 할당을 기다리는 상태이다. CPU 스케줄링은 준비 큐에 있는 프로세스 중 다음에 CPU를 사용할 프로세스를 선택하는 일이다." };
  const objectives = [{ id: "o1", text: "준비 상태를 설명할 수 있다" }, { id: "o2", text: "CPU 스케줄링을 설명할 수 있다" }];
  for (const persona of ["MALE_EASY", "FEMALE_NORMAL"] as const) {
    const llm = createLiveLlm({ async completeJSON(_prompt, user, schema) {
      const input = JSON.parse(user);
      if (input.statement) return schema.parse({ distractors: [] }); // use the validated offline options
      if (input.chapter) return schema.parse({ concepts: [{ name: "준비 상태", quote: explanation }],
        contradictions: [{ claim: explanation }], coverage: [], reactionQuote: "" });
      assert.equal(input.chapter, undefined, "the learner response never sees the source");
      assert.equal(input.explanation, explanation);
      return schema.parse({ reactions: ["그런데 CPU 할당을 기다리는 상태예요."], question: "사실은 CPU 할당을 기다리지 않나요?" });
    }, async *streamText() { throw new Error("unused"); } });
    const events = await collect(llm.juniorTurn({ chapter: readiness, level: "EASY", persona, objectives,
      history: [{ role: "JUNIOR", stage: "QUESTION", content: "준비 상태를 설명해 주실래요?" }], heardConcepts: [], explanation }));
    assert.ok(!events.some((event) => event.type === "doubt"));
    const reaction = events.find((event) => event.type === "reaction")!;
    assert.equal(reaction.content, PERSONAS[persona].examples.reaction);
    const question = events.find((event) => event.type === "question")!;
    assert.deepEqual(question.coveredObjectives, ["o1"]);
    assert.match(question.content, /CPU 스케줄링/u);
    assert.doesNotMatch(question.content, /사실은|준비 상태|신뢰|믿/u);
  }
});

test("MCQ authoring rejects meta negation, unrelated options, duplicates and length cues", () => {
  const correct = "준비 상태는 CPU 할당을 기다리는 상태이다.";
  const distractors = ["준비 상태는 입출력 완료를 기다리는 상태이다.", "준비 상태는 이미 CPU를 사용하고 있는 상태이다.", "준비 상태는 프로세스 실행이 종료된 상태이다."];
  const schema = teachingDistractorsSchema(correct, "준비 상태");
  assert.ok(schema.safeParse({ distractors }).success);
  for (const invalid of ["준비 상태는 맞지 않다.", "준비 상태의 설명은 옳지 않다.", "운영체제는 파일을 디스크에 저장하는 역할이다.", correct,
    "준비 상태는 " + "오직 그 상태에 대한 매우 구체적인 조건을 가진 ".repeat(4)]) {
    assert.equal(schema.safeParse({ distractors: [invalid, ...distractors.slice(1)] }).success, false, invalid);
  }
});

test("teaching MCQ authoring receives a literal source assertion, without a persona or hidden exam key", async () => {
  const readiness = { title: "프로세스 상태", points: ["준비 상태"], text: "준비 상태는 CPU 할당을 기다리는 상태이다." };
  const llm = createLiveLlm({ async completeJSON(_prompt, user, schema) {
    const input = JSON.parse(user);
    assert.equal(input.statement, teachingFactFor(readiness, "준비 상태"));
    assert.equal(input.source.text, readiness.text);
    for (const key of ["persona", "rubric", "exam", "answers"]) assert.equal(input[key], undefined);
    return schema.parse({ distractors: ["준비 상태는 입출력 완료를 기다리는 상태이다.", "준비 상태는 이미 CPU를 사용하고 있는 상태이다.", "준비 상태는 프로세스 실행이 종료된 상태이다."] });
  }, async *streamText() { throw new Error("unused"); } });
  const choices = await llm.generateTeachingChoices!({ chapter: readiness, topic: "준비 상태" });
  assert.equal(choices.length, 4);
  assert.equal(choices.filter((choice) => choice.text === readiness.text).length, 1);
  assert.equal(new Set(choices.map((choice) => choice.text)).size, 4);
});

test("quiz preparation separates five formal questions from the human junior persona", async () => {
  const concepts = sourceLearningConcepts(chapter, 5);
  const llm = createLiveLlm({ async completeJSON(prompt, user, schema) {
    const input = JSON.parse(user);
    assert.equal(input.persona, undefined);
    assert.equal(input.voice, undefined);
    assert.equal(input.questionCount, 5);
    assert.doesNotMatch(prompt, /부드러운 해요체|반말을 사용|반응에는|말투:/u);
    return schema.parse({ objectives: concepts.map((concept, i) => ({ id: `o${i + 1}`, text: `${concept.topic}을 설명할 수 있다`, sourceQuote: concept.sourceQuote })),
      questions: Array.from({ length: 5 }, (_, i) => ({ qid: `q${i + 1}`, order: i + 1, points: 20, question: `개념 ${i + 1}을 설명하시오.`, objectiveRef: `o${i + 1}`, rubric: "첫째 사실;둘째 사실" })),
      firstQuestion: "첫 개념을 설명하시오." });
  }, async *streamText() { throw new Error("unused"); } });
  const prepared = await llm.prepareSession({ chapter, level: "EASY", persona: "FEMALE_NORMAL" });
  assert.equal(prepared.questions.length, 5);
  assert.match(prepared.firstQuestion, /주실래요/u);
  assert.doesNotMatch(prepared.firstQuestion, /^선배님/u);
  assert.ok(prepared.questions.every((question) => !/선배|요\?|\*\*/u.test(question.question)));
});
