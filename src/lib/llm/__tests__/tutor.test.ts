import assert from "node:assert/strict";
import { test } from "node:test";
import { completeJSONWith } from "../provider";
import { createTutorExplain } from "../tutor";
import type { Llm } from "../types";

const source = "다른 조건이 일정할 때 가격이 오르면 수요량은 감소한다. 수요량은 특정 가격에서 사고자 하는 양이다.";
const input: Parameters<Llm["tutorExplain"]>[0] = {
  chapter: { title: "수요의 이해", points: ["수요량", "수요 법칙"], text: source },
  gap: { title: "수요 법칙", diagnosis: "가격과 수요량의 관계가 잘못되었습니다.", sourceExcerpt: source },
  request: "쉽게 알려주세요",
};
const valid = {
  opening: "가격과 수요량의 관계를 다시 살펴보면 좋겠습니다.",
  explanation: { text: "다른 조건이 일정할 때 가격이 오르면 수요량은 감소합니다.", sourceQuote: "다른 조건이 일정할 때 가격이 오르면 수요량은 감소한다." },
  clarification: { text: "수요량은 특정 가격에서 사고자 하는 양입니다.", sourceQuote: "수요량은 특정 가격에서 사고자 하는 양이다." },
  analogy: "😀 간식값이 오르면 같은 용돈으로 사려던 간식의 개수를 줄이는 상황을 떠올리면 됩니다.",
  takeaway: "다른 조건이 같다면 가격 상승은 수요량 감소로 이어집니다.",
};

async function collect(events: ReturnType<Llm["tutorExplain"]>) {
  const result = [];
  for await (const event of events) result.push(event);
  return result;
}

function calls(reply: (attempt: number, input: Record<string, unknown>) => unknown) {
  let attempts = 0;
  return {
    get attempts() { return attempts; },
    async completeJSON<T>(system: string, user: string, schema: import("zod").z.ZodType<T>) {
      return completeJSONWith(async () => JSON.stringify(reply(++attempts, JSON.parse(user))), system, user, schema);
    },
    async *streamText(): AsyncIterable<string> { throw new Error("Unvalidated text must not be streamed"); },
  };
}

test("tutor produces five sentences, one analogy, the required last sentence, and matching Unicode tokens", async () => {
  const provider = calls(() => valid);
  const events = await collect(createTutorExplain(provider)(input));
  assert.equal(provider.attempts, 1);
  const response = events.filter((event) => event.type === "token").map((event) => event.token).join("");
  assert.equal(response.split(/(?<=[.!?])\s+/u).length, 5);
  assert.equal(response.match(/쉬운 비유로/g)?.length, 1);
  assert.match(response, /이것만 기억하면 됩니다: 다른 조건이 같다면 가격 상승은 수요량 감소로 이어집니다\.$/u);
  assert.ok(events.some((event) => event.type === "token" && event.token === "😀"));
  assert.deepEqual(events.at(-1), { type: "final", response });
});

test("tutor removes bold markup before streaming but validates untouched source quotations", async () => {
  const quoted = "**가격**이 오르면 수요량은 감소한다.";
  const provider = calls(() => ({
    ...valid,
    opening: "**핵심 관계**를 확인합니다.",
    explanation: { text: "**가격**이 오르면 수요량은 감소합니다.", sourceQuote: quoted },
    clarification: { text: "다른 조건은 일정합니다.", sourceQuote: quoted },
    takeaway: "**가격과 수요량**의 관계를 기억합니다.",
  }));
  const events = await collect(createTutorExplain(provider)({ ...input,
    chapter: { ...input.chapter, text: quoted }, gap: { ...input.gap, sourceExcerpt: quoted },
  }));
  const text = events.filter(event => event.type === "token").map(event => event.token).join("");
  assert.ok(!text.includes("**"));
  assert.match(text, /가격과 수요량/);
  assert.deepEqual(events.at(-1), { type: "final", response: text });
  assert.equal(provider.attempts, 1);
});

test("tutor repairs an invalid sentence before emitting any tokens, with at most two attempts", async () => {
  const provider = calls((attempt) => attempt === 1 ? { ...valid, analogy: "INVALID_SENTENCE. 두 번째 문장입니다." } : valid);
  const events = await collect(createTutorExplain(provider)(input));
  assert.equal(provider.attempts, 2);
  assert.ok(!JSON.stringify(events).includes("INVALID_SENTENCE"));
  const invalid = calls(() => ({ ...valid, takeaway: "요약입니다. 추가 문장입니다." }));
  const emitted: unknown[] = [];
  await assert.rejects(async () => {
    for await (const event of createTutorExplain(invalid)(input)) emitted.push(event);
  }, /두 번 연속/u);
  assert.equal(invalid.attempts, 2);
  assert.deepEqual(emitted, []);
});

test("tutor rejects invented evidence and an additional analogy outside the analogy slot", async () => {
  for (const reply of [
    { ...valid, explanation: { text: valid.explanation.text, sourceQuote: "가격이 오르면 수요량은 증가한다." } },
    { ...valid, clarification: { text: "풍선처럼 수요가 부풀어 오릅니다.", sourceQuote: source } },
  ]) {
    const provider = calls(() => reply);
    await assert.rejects(collect(createTutorExplain(provider)(input)), /두 번 연속/u);
    assert.equal(provider.attempts, 2);
  }
});

test("tutor omits a stale gap excerpt from provider evidence and fails for empty source", async () => {
  const provider = calls((_attempt, payload) => {
    assert.equal((payload.gap as { sourceExcerpt: string }).sourceExcerpt, "");
    return valid;
  });
  await collect(createTutorExplain(provider)({ ...input, gap: { ...input.gap, sourceExcerpt: "다른 자료에만 있는 문장" } }));
  const noSource = calls(() => { throw new Error("No provider request should occur"); });
  await assert.rejects(collect(createTutorExplain(noSource)({ ...input, chapter: { ...input.chapter, text: " " } })), /자료가 없습니다/u);
  assert.equal(noSource.attempts, 0);
});

test("tutor preserves decimal quantities without treating their point as a sentence boundary", async () => {
  const provider = calls(() => ({
    ...valid,
    explanation: { text: "기준 가격은 1.5원입니다.", sourceQuote: "기준 가격은 1.5원이다." },
  }));
  const events = await collect(createTutorExplain(provider)({ ...input, chapter: { ...input.chapter, text: `${source} 기준 가격은 1.5원이다.` } }));
  assert.equal(provider.attempts, 1);
  assert.match(JSON.stringify(events.at(-1)), /1\.5원/u);
});

test("tutor does not accept the artificial chapter omission marker as source evidence", async () => {
  const provider = calls(() => ({
    ...valid,
    explanation: { text: "자료를 모두 읽었다고 가정할 수 없습니다.", sourceQuote: "…중간 생략…" },
  }));
  await assert.rejects(collect(createTutorExplain(provider)({
    ...input,
    chapter: { ...input.chapter, text: `${source}${"긴 자료 ".repeat(2_000)}` },
  })), /두 번 연속/u);
  assert.equal(provider.attempts, 2);
});
