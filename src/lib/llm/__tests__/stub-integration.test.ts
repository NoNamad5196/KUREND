import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import chapters from "../../../../fixtures/chapters.economics.json";
import demo from "../../../../fixtures/demo.economics.json";
import { stubLlm } from "../stub";
import type { ChapterText, Llm } from "../types";

const source = readFileSync(new URL("../../../../fixtures/economics.md", import.meta.url), "utf8");
const first = chapters.chapters[0];
const chapter: ChapterText = {
  ...first,
  // C's seed and uploaded chapters do not share the D fixture point order.
  points: ["수요량과 수요", "수요 법칙", "곡선 위 이동 vs 이동"],
  text: source.slice(first.startOffset, first.endOffset),
};
async function collect(input: Parameters<Llm["juniorTurn"]>[0]) {
  const events = [];
  for await (const event of stubLlm.juniorTurn(input)) events.push(event);
  return events;
}

test("stub concepts and follow-up questions track prepared objectives when C chapter points differ", async () => {
  const previousDelay = process.env.LLM_STUB_DELAY_MS;
  process.env.LLM_STUB_DELAY_MS = "0";
  try {
    const prepared = await stubLlm.prepareSession({ chapter, level: "EASY" });
    const firstTurn = await collect({ chapter, level: "EASY", objectives: prepared.objectives, heardConcepts: [], history: [], explanation: demo.correctedExplanation });
    const concepts = firstTurn.find((event) => event.type === "concepts");
    const question = firstTurn.find((event) => event.type === "question");
    assert.deepEqual(concepts?.heardConcepts, ["수요 법칙"]);
    assert.deepEqual(question?.coveredObjectives, ["o1"]);
    assert.match(question?.content ?? "", /수요량의 변화/u);
    assert.doesNotMatch(question?.content ?? "", /수요 법칙/u);

    const secondTurn = await collect({
      chapter, level: "EASY", objectives: prepared.objectives, heardConcepts: concepts!.heardConcepts,
      history: [{ role: "USER", stage: "ANSWER", content: demo.correctedExplanation }],
      explanation: demo.taught[2].content,
    });
    assert.deepEqual(secondTurn.find((event) => event.type === "concepts")?.heardConcepts, ["수요 법칙", "수요량의 변화"]);
    const next = secondTurn.find((event) => event.type === "question");
    assert.deepEqual(next?.coveredObjectives, ["o1", "o2"]);
    assert.match(next?.content ?? "", /수요 결정요인/u);

    const hard = await stubLlm.prepareSession({ chapter, level: "HARD" });
    assert.match(hard.firstQuestion, /^수요 법칙/u);
  } finally {
    if (previousDelay === undefined) delete process.env.LLM_STUB_DELAY_MS;
    else process.env.LLM_STUB_DELAY_MS = previousDelay;
  }
});
