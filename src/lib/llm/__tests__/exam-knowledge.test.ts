import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveLlm } from "../live";
import { answerFromQuote, completeTeachingQuote, groundedChoice, groundedErrorReason } from "../exam-grounding";
import { decodeGapConcepts, encodeGapConcepts } from "@/lib/learning/error-reason";

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> { const events: T[] = []; for await (const event of stream) events.push(event); return events; }
const wrong = "준비 상태는 입출력 완료를 기다리는 상태이다.";
const correct = "준비 상태는 CPU 할당을 기다리는 상태이다.";
const choices = ["① 준비 상태는 CPU 할당을 기다리는 상태이다.", "② 준비 상태는 입출력 완료를 기다리는 상태이다.", "③ 준비 상태는 CPU를 할당받아 실행 중인 상태이다.", "④ 준비 상태는 실행이 종료된 상태이다."];

test("answer generation cannot repair a false taught claim even when the provider supplies the true paraphrase", async () => {
  const model = createLiveLlm({ async completeJSON(prompt, user, schema) {
    const input = JSON.parse(user);
    assert.deepEqual(Object.keys(input).sort(), ["heardConcepts", "question", "taught"]);
    assert.doesNotMatch(prompt, /현재 후배|컴돌이|컴순이/u);
    return schema.parse({ thought: "**선배님**, 답을 알려드릴게요!", sentences: [{ quote: wrong, answer: correct, ref: 1, level: "STRONG" }], unlearned: false });
  }, async *streamText() { throw new Error("not used"); } });
  const events = await collect(model.writeExamAnswer({ question: "준비 상태의 의미를 설명하시오.", taught: [{ ref: 1, content: wrong }], heardConcepts: ["준비 상태"], persona: "FEMALE_NORMAL" }));
  assert.equal(events.find((event) => event.type === "final")?.answer, wrong);
  assert.doesNotMatch(events.filter((event) => event.type === "thought").map((event) => event.token).join(""), /선배|\*\*/u);
});

test("objective provider cannot override a learned false assertion using its answer key knowledge", async () => {
  const model = createLiveLlm({ async completeJSON(_prompt, _user, schema) {
    return schema.parse({ thought: "확인", choice: "①", sentences: [{ quote: wrong, answer: correct, ref: 1, level: "STRONG" }], unlearned: false });
  }, async *streamText() { throw new Error("not used"); } });
  const events = await collect(model.writeExamAnswer({ question: "준비 상태에 대한 설명으로 적절한 것은?", choices, taught: [{ ref: 1, content: wrong }], heardConcepts: [] }));
  assert.equal(events.find((event) => event.type === "final")?.answer, choices[1]);
  assert.equal(groundedChoice(choices, []), null);
  assert.equal(groundedChoice(["① 같은 설명", "② 같은 설명", "③ 다른 설명", "④ 다른 설명"], ["같은 설명"]), null);
});

test("wrong knowledge requires a persisted quote, a directly derived answer and confirmed contradiction", () => {
  const base = { answer: answerFromQuote(wrong), evidenceQuote: wrong, taught: [{ content: wrong }] };
  assert.equal(groundedErrorReason({ ...base, contradictsSource: true }), "WRONG_KNOWLEDGE");
  assert.equal(groundedErrorReason({ ...base, proposed: "WRONG_KNOWLEDGE", contradictsSource: false }), "UNKNOWN");
  assert.equal(groundedErrorReason({ ...base, answer: correct, contradictsSource: true }), "UNKNOWN");
  assert.equal(groundedErrorReason({ ...base, taught: [], contradictsSource: true }), "UNKNOWN");
  assert.equal(groundedErrorReason({ ...base, answer: "배우지 못한 내용이라 답을 쓸 수 없음." }), "INSUFFICIENT_LEARNING");
  assert.equal(groundedErrorReason({ ...base, answer: choices[1], choices, wrongObjective: true }), "WRONG_KNOWLEDGE");
});

test("cause metadata round-trips in the existing concepts JSON and leaves legacy arrays readable", () => {
  const raw = encodeGapConcepts(["준비 상태"], "WRONG_KNOWLEDGE");
  assert.deepEqual(JSON.parse(raw).filter((item: unknown) => typeof item === "string"), ["준비 상태"]);
  assert.deepEqual(decodeGapConcepts(raw), { concepts: ["준비 상태"], errorReason: "WRONG_KNOWLEDGE" });
  assert.deepEqual(decodeGapConcepts('["기존 개념"]'), { concepts: ["기존 개념"] });
  assert.deepEqual(decodeGapConcepts('not json'), { concepts: [] });
});


test("a substring citation cannot drop a learned negation or condition", async () => {
  const teaching = "준비 상태는 CPU 할당을 기다리는 상태가 아니라 입출력 완료를 기다리는 상태이다.";
  const model = createLiveLlm({ async completeJSON(_prompt, _user, schema) {
    return schema.parse({ thought: "확인", sentences: [{ quote: "준비 상태는 CPU 할당을 기다리는 상태", answer: correct, ref: 1, level: "STRONG" }], unlearned: false });
  }, async *streamText() { throw new Error("not used"); } });
  const events = await collect(model.writeExamAnswer({ question: "준비 상태의 의미를 설명하시오.", taught: [{ ref: 1, content: teaching }], heardConcepts: [] }));
  assert.equal(events.find((event) => event.type === "final")?.answer, teaching);
});


test("complete teaching citations stay inside the selected sentence across lines and lists", () => {
  const text = "- 실행 상태는 CPU를 사용한다.\n\n- 준비 상태는 CPU가 아니라 입출력을 기다린다. 다음에는 대기 상태를 설명한다.";
  assert.equal(completeTeachingQuote("준비 상태는 CPU", text), "- 준비 상태는 CPU가 아니라 입출력을 기다린다.");
  assert.equal(completeTeachingQuote("대기 상태", text), "다음에는 대기 상태를 설명한다.");
});


test("casual state explanations become declarative answers without changing the learned predicate", () => {
  assert.equal(answerFromQuote("준비 상태는 입출력이 끝나기를 기다리는 상태야."), "준비 상태는 입출력이 끝나기를 기다리는 상태이다.");
  assert.equal(answerFromQuote("- **준비 상태는 입출력을 기다리는 상태야.**"), "준비 상태는 입출력을 기다리는 상태이다.");
});
