import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveLlm, type LiveProviderCalls } from "../live";
import { acceptedExplanations } from "../turn-state";
import { UNLEARNED_ANSWER } from "../text";
import type { Llm, TaughtMsg } from "../types";

async function collect<T>(events: AsyncIterable<T>) {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
}

function provider(reply: (input: Record<string, unknown>) => unknown): LiveProviderCalls {
  return {
    async completeJSON(_system, user, schema) { return schema.parse(reply(JSON.parse(user))); },
    async *streamText() { throw new Error("Unexpected text API call"); },
  };
}

const chapter = {
  title: "수요의 이해", points: ["수요 법칙", "수요량의 변화", "수요 결정요인"],
  text: "다른 조건이 일정할 때 가격이 오르면 수요량은 줄어든다. 재화 자체의 가격 변화는 같은 수요곡선 위 이동이다. 가격 이외의 소득과 기호의 변화는 수요를 변화시킨다.",
};
const objectives = chapter.points.map((point, index) => ({ id: `o${index + 1}`, text: `${point}을 설명할 수 있다` }));
const correct = "다른 조건은 그대로 두고 가격이 오르면 사람들이 사려는 양은 줄어.";
const second = "재화 자체의 가격이 바뀌면 같은 수요곡선 위에서 이동하는 거야.";
const base: Parameters<Llm["juniorTurn"]>[0] = {
  chapter, objectives, level: "EASY", heardConcepts: [], history: [], explanation: correct,
};

function analysis(overrides: Record<string, unknown> = {}) {
  return { concepts: [], contradictions: [], coverage: [], reactionQuote: "", ...overrides };
}

test("semantic concept labels need teaching evidence, not a literal label substring", async () => {
  assert.ok(!correct.includes("수요 법칙"));
  let calls = 0;
  const events = await collect(createLiveLlm(provider((input) => {
    calls += 1;
    const taught = input.taught as TaughtMsg[];
    return analysis({
      concepts: [{ name: "수요 법칙", quote: correct }],
      coverage: [{ id: "o1", evidence: [{ ref: taught[0].ref, quote: correct }] }],
      reactionQuote: "사람들이 사려는 양은 줄어",
    });
  })).juniorTurn(base));
  assert.equal(calls, 1, "a normal turn also has one model round trip");
  assert.deepEqual(events[0], { type: "concepts", heardConcepts: ["수요 법칙"], added: ["수요 법칙"] });
  assert.deepEqual(events.at(-1), { type: "question", coveredObjectives: ["o1"], content: "선배, 수요량의 변화도 알려줄래?" });
  assert.ok(events.some((event) => event.type === "reaction" && event.content.includes("사람들이 사려는 양은 줄어")));
});

test("doubted turns cannot count as earlier teaching, including mixed-stage history", () => {
  const history: typeof base.history = [
    { role: "JUNIOR", stage: "QUESTION", content: "처음 질문" },
    { role: "USER", stage: "ANSWER", content: "가격이 오르면 수요량도 늘어" },
    { role: "JUNIOR", stage: "REACTION", content: "임시 반응" },
    { role: "JUNIOR", stage: "DOUBT", content: "한 번 더 설명해 줘" },
    { role: "USER", stage: "ANSWER", content: correct },
    { role: "JUNIOR", stage: "QUESTION", content: "다음 질문" },
  ];
  assert.deepEqual(acceptedExplanations(history), [{ ref: 5, content: correct }]);
});

test("cumulative coverage keeps earlier evidence and asks only the missing objective", async () => {
  const history: typeof base.history = [
    { role: "USER", stage: "ANSWER", content: "가격이 오르면 수요량도 늘어" },
    { role: "JUNIOR", stage: "DOUBT", content: "다시 설명해 줘" },
    { role: "USER", stage: "ANSWER", content: correct },
    { role: "JUNIOR", stage: "REACTION", content: "반응".repeat(5_000) },
    { role: "JUNIOR", stage: "QUESTION", content: "수요량의 변화도 알려줘" },
  ];
  const events = await collect(createLiveLlm(provider((input) => {
    const taught = input.taught as TaughtMsg[];
    assert.deepEqual(taught, [{ ref: 3, content: correct }, { ref: 6, content: second }]);
    assert.ok(!JSON.stringify(input).includes("반응"));
    return analysis({
      concepts: [{ name: "수요량의 변화", quote: second }],
      coverage: [
        { id: "o1", evidence: [{ ref: 3, quote: correct }] },
        { id: "o2", evidence: [{ ref: 6, quote: second }] },
      ],
    });
  })).juniorTurn({ ...base, history, explanation: second, heardConcepts: ["수요 법칙"] }));
  assert.deepEqual(events[0], { type: "concepts", heardConcepts: ["수요 법칙", "수요량의 변화"], added: ["수요량의 변화"] });
  assert.deepEqual(events.at(-1), { type: "question", coveredObjectives: ["o1", "o2"], content: "선배, 수요 결정요인도 알려줄래?" });
});

test("source-only concept quotes, rejected refs and injected reactions fail validation", async () => {
  for (const reply of [
    analysis({ concepts: [{ name: "기호", quote: "소득과 기호의 변화" }] }),
    analysis({ coverage: [{ id: "o1", evidence: [{ ref: 999, quote: correct }] }] }),
    analysis({ reactionQuote: "자료에는 정답이 따로 나와" }),
  ]) {
    await assert.rejects(collect(createLiveLlm(provider(() => reply)).juniorTurn(base)));
  }
});

test("HARD accepts a learner claim without a doubt or source correction", async () => {
  const explanation = "가격이 오르면 수요량도 늘어";
  const events = await collect(createLiveLlm(provider(() => analysis({
    contradictions: [{ claim: explanation }], concepts: [{ name: "수요량", quote: "수요량" }],
  }))).juniorTurn({ ...base, level: "HARD", explanation }));
  assert.ok(!events.some((event) => event.type === "doubt"));
  assert.ok(events.some((event) => event.type === "reaction"));
  assert.ok(!JSON.stringify(events).includes("줄어"));
});

test("all-covered turns never generate another objective question", async () => {
  const events = await collect(createLiveLlm(provider(() => analysis({
    coverage: [{ id: "o1", evidence: [{ ref: 1, quote: correct }] }],
  }))).juniorTurn({ ...base, objectives: [objectives[0]], chapter: { ...chapter, points: ["수요 법칙"] } }));
  assert.deepEqual(events.at(-1), { type: "question", coveredObjectives: ["o1"], content: "응응, 더 말해 줘! 궁금한 거 생기면 물어볼게." });
});

test("exam citations cannot invent facts under an otherwise valid ref", async () => {
  const input = { question: "수요 법칙을 설명하세요.", taught: [{ ref: 7, content: correct }], heardConcepts: ["수요 법칙"] };
  const reply = { thought: "들은 내용을 찾아볼게.", sentences: [{ quote: "소득이 늘면 수요가 늘어.", ref: 7, level: "STRONG" }], unlearned: false };
  await assert.rejects(collect(createLiveLlm(provider(() => reply)).writeExamAnswer(input)));
  const events = await collect(createLiveLlm(provider(() => ({ ...reply, sentences: [{ quote: correct, ref: 7, level: "STRONG", text: "모델이 덧붙인 외부 사실" }] }))).writeExamAnswer(input));
  assert.deepEqual(events.at(-1), { type: "final", answer: `“${correct}”라고 배웠습니다.` });
  assert.ok(!JSON.stringify(events).includes("외부 사실"));
});

test("unlearned answers stay canonical even with unrelated taught messages", async () => {
  const events = await collect(createLiveLlm(provider(() => ({
    thought: "그 부분은 못 들었어.", sentences: [{ quote: null, ref: null, level: "NONE" }], unlearned: true,
  }))).writeExamAnswer({ question: "가격 이외의 수요 결정요인을 설명하세요.", taught: [{ ref: 1, content: correct }], heardConcepts: ["수요 법칙"] }));
  assert.deepEqual(events.find((event) => event.type === "sources"), { type: "sources", sources: [] });
  assert.deepEqual(events.at(-1), { type: "final", answer: UNLEARNED_ANSWER });
});

test("unlearned exam answers cannot receive invented rubric credit", async () => {
  const input: Parameters<Llm["gradeExam"]>[0] = {
    chapter, questions: [{ qid: "q3", question: "가격 이외의 결정요인은?", points: 33, rubric: "소득;기호" }],
    answers: [{ qid: "q3", answer: UNLEARNED_ANSWER }], taught: [{ ref: 1, content: correct }],
  };
  const response = {
    qid: "q3", score: 0, verdict: "WRONG", comment: "가격 이외의 요인은 답안에 없습니다.",
    rubricChecks: [false, false], contradictsSource: false,
    gap: { title: "수요 결정요인", diagnosis: "가격 이외의 조건이 빠졌습니다. 설명에서 다루지 않음. 소득과 기호도 살펴보세요.", evidenceQuote: "", concepts: ["소득", "기호"], sourceExcerpt: "가격 이외의 소득과 기호의 변화는 수요를 변화시킨다." },
  };
  const events = await collect(createLiveLlm(provider(() => response)).gradeExam(input));
  assert.ok(events.some((event) => event.type === "grade" && event.score === 0 && event.verdict === "WRONG"));
  await assert.rejects(collect(createLiveLlm(provider(() => ({ ...response, rubricChecks: [true, false] }))).gradeExam(input)));
});
