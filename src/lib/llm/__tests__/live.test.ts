import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveLlm, type LiveProviderCalls } from "../live";
import { UNLEARNED_ANSWER } from "../text";
import type { Llm } from "../types";

async function collect<T>(events: AsyncIterable<T>) {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
}

function provider(reply: (input: Record<string, unknown>, system: string) => unknown): LiveProviderCalls {
  return {
    async completeJSON(system, user, schema) { return schema.parse(reply(JSON.parse(user), system)); },
    async *streamText() { throw new Error("Unexpected text API call"); },
  };
}

test("live P1 asks for paragraph indexes and converts them to the correct source offsets", async () => {
  const sources = Array.from({ length: 4 }, (_, index) => ({ sourceId: `src_${index}`, text: "가".repeat(400) }));
  const model = createLiveLlm(provider((input) => {
    const listed = input.sources as { sourceId: string; paragraphs: { index: number; label: string }[] }[];
    assert.equal(listed.length, 4);
    return {
      title: "자료 목차",
      chapters: listed.map((source, index) => {
        assert.equal(source.paragraphs[0].label, `[P${source.paragraphs[0].index}]`);
        return { title: `목차 ${index}`, points: ["개념", "사례"], startPara: source.paragraphs[0].index, endPara: source.paragraphs.at(-1)!.index };
      }),
    };
  }));
  const result = await model.generateChapters({ sources });
  assert.deepEqual(result.chapters.map(({ sourceId, startOffset, endOffset }) => ({ sourceId, startOffset, endOffset })),
    sources.map(({ sourceId }) => ({ sourceId, startOffset: 0, endOffset: 400 })));
});

test("live P3 doubt uses one call and never discloses source facts", async () => {
  let calls = 0;
  const model = createLiveLlm(provider(() => {
    calls += 1;
    return {
      concepts: [{ name: "수요량", quote: "수요량" }], coverage: [], reactionQuote: "",
      contradictions: [{ claim: "가격이 오르면 수요량도 늘어" }],
    };
  }));
  const events = await collect(model.juniorTurn({
    chapter: { title: "수요", points: ["수요량"], text: "원문_전용_정답: 가격이 오르면 수요량은 감소한다." },
    level: "EASY", objectives: [{ id: "o1", text: "수요 설명" }], heardConcepts: ["이미 들은 개념"], history: [],
    explanation: "가격이 오르면 수요량도 늘어",
  }));
  assert.equal(calls, 1);
  assert.deepEqual(events.map((event) => event.type), ["concepts", "doubt"]);
  assert.deepEqual(events[0], { type: "concepts", heardConcepts: ["이미 들은 개념"], added: [] });
  assert.ok(!JSON.stringify(events).includes("감소한다"));
});

test("live P4 request contains question, taught messages, heard concepts and the chapter as a wording reference, never the rubric", async () => {
  const model = createLiveLlm(provider((input) => {
    assert.deepEqual(Object.keys(input).sort(), ["chapter", "heardConcepts", "question", "taught", "taughtHints"]);
    assert.ok(!JSON.stringify(input).includes("DO_NOT_LEAK"));
    return { thought: "들은 설명을 떠올려 보자.", sentences: [{ quote: "가격이 오르면 수요량은 줄어.", ref: 2, level: "STRONG" }], unlearned: false };
  }));
  const input = {
    question: "수요 법칙을 설명하세요.", taught: [{ ref: 2, content: "가격이 오르면 수요량은 줄어." }], heardConcepts: ["수요량"],
    chapter: { title: "수요", points: ["수요량"], text: "다른 조건이 일정할 때 가격과 수요량은 반대로 움직인다." }, rubric: "DO_NOT_LEAK_RUBRIC",
  };
  const events = await collect(model.writeExamAnswer(input));
  assert.deepEqual(events.find((event) => event.type === "sources"), { type: "sources", sources: input.taught });
  assert.ok(events.some((event) => event.type === "sentence" && event.ref === 2 && event.unlearned === false));
});

test("live P4 never calls the provider with no teaching and emits the required unknown answer", async () => {
  const model = createLiveLlm(provider(() => { throw new Error("No provider call expected"); }));
  const events = await collect(model.writeExamAnswer({ question: "가르치지 않은 개념", taught: [], heardConcepts: [] }));
  assert.deepEqual(events.find((event) => event.type === "sentence"), { type: "sentence", text: UNLEARNED_ANSWER, ref: null, level: "NONE", unlearned: true });
  assert.deepEqual(events.at(-1), { type: "final", answer: UNLEARNED_ANSWER });
});

test("live P5 derives score from rubric checks and verifies quoted source/evidence", async () => {
  const input: Parameters<Llm["gradeExam"]>[0] = {
    chapter: { title: "수요", points: ["수요량"], text: "다른 조건이 일정할 때 가격과 수요량은 반대로 움직인다." },
    questions: [{ qid: "q1", question: "수요 법칙", points: 34, rubric: "조건 일정;역관계" }],
    answers: [{ qid: "q1", answer: "가격과 수요량은 반대입니다." }], taught: [{ ref: 1, content: "가격과 수요량은 반대야." }],
  };
  const response = {
    qid: "q1", score: 1000, verdict: "CORRECT", comment: "역관계는 맞지만 다른 조건이 일정함을 빠뜨렸습니다.",
    rubricChecks: [false, true], contradictsSource: false,
    gap: { title: "일정한 조건", diagnosis: "가격 외 조건의 가정이 빠졌습니다. 사용자 설명 [ref 1]에서도 이 조건을 다루지 않았습니다. 다른 조건을 함께 확인하세요.", evidenceQuote: "가격과 수요량은 반대야.", concepts: ["조건 일정"], sourceExcerpt: input.chapter.text },
  };
  const events = await collect(createLiveLlm(provider(() => response)).gradeExam(input));
  assert.deepEqual(events[0], { type: "grade", qid: "q1", score: 17, maxScore: 34, verdict: "PARTIAL", comment: response.comment });
  assert.equal(events[1].type, "gap");
  await assert.rejects(collect(createLiveLlm(provider(() => ({ ...response, gap: { ...response.gap, sourceExcerpt: "원문에 없는 인용" } }))).gradeExam(input)));
  await assert.rejects(collect(createLiveLlm(provider(() => ({ ...response, gap: { ...response.gap, evidenceQuote: "사용자가 말하지 않은 내용" } }))).gradeExam(input)));
});

test("live P6 token chunks and final response preserve the same Unicode text", async () => {
  const source = "다른 조건이 같을 때 가격이 오르면 수요량은 줄어든다.";
  const calls = provider(() => ({
    opening: "😀 가격과 수요량의 관계를 함께 살펴보겠습니다.",
    explanation: { text: "가격이 오르면 수요량은 줄어듭니다.", sourceQuote: source },
    clarification: { text: "이 관계에서는 다른 조건이 같다는 가정이 필요합니다.", sourceQuote: source },
    analogy: "간식값이 오르면 사려던 개수를 줄이는 상황을 떠올리면 됩니다.",
    takeaway: "다른 조건이 같으면 가격과 수요량은 반대로 움직입니다.",
  }));
  const events = await collect(createLiveLlm(calls).tutorExplain({
    chapter: { title: "수요 법칙", points: ["수요량"], text: source },
    gap: { title: "수요 법칙", diagnosis: "가격과 수요량의 관계가 잘못되었습니다.", sourceExcerpt: source }, request: "설명해줘",
  }));
  const joined = events.filter((event) => event.type === "token").map((event) => event.token).join("");
  assert.ok(events.some((event) => event.type === "token" && event.token === "😀"));
  assert.equal(joined.split(/(?<=[.!?])\s+/u).length, 5);
  assert.match(joined, /이것만 기억하면 됩니다: 다른 조건이 같으면 가격과 수요량은 반대로 움직입니다\.$/u);
  assert.deepEqual(events.at(-1), { type: "final", response: joined });
});
