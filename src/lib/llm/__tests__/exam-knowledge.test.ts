import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveLlm } from "../live";
import { answerFromQuote, completeTeachingQuote, groundedChoice, groundedErrorReason, groundedDiagnosis } from "../exam-grounding";
import { decodeGapConcepts, encodeGapConcepts, LEARNING_ERROR_LABELS } from "@/lib/learning/error-reason";

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
  assert.equal(events.find((event) => event.type === "final")?.answer, "2번");
  assert.equal(groundedChoice(choices, []), null);
  assert.equal(groundedChoice(["① 같은 설명", "② 같은 설명", "③ 다른 설명", "④ 다른 설명"], ["같은 설명"]), null);
});

test("objective answer provenance follows the winning quote rather than the first cited message", async () => {
  const other = "CPU 스케줄링은 준비 큐에서 다음에 실행할 프로세스를 선택하는 일이다.";
  const model = createLiveLlm({ async completeJSON(_prompt, _user, schema) {
    return schema.parse({ thought: "근거 확인", choice: "①", unlearned: false, sentences: [
      { quote: other, ref: 1, level: "FAINT" },
      { quote: wrong, ref: 7, level: "STRONG" },
    ] });
  }, async *streamText() { throw new Error("not used"); } });
  assert.notEqual(groundedChoice(choices, [other]), "②");
  const events = await collect(model.writeExamAnswer({ question: "준비 상태에 대한 설명을 고르시오.", choices,
    taught: [{ ref: 1, content: other }, { ref: 7, content: wrong }], heardConcepts: [] }));
  const sentences = events.filter((event) => event.type === "sentence");
  assert.deepEqual(sentences, [{ type: "sentence", text: "2번", ref: 7, level: "STRONG", unlearned: false }]);
  assert.equal(events.find((event) => event.type === "final")?.answer, "2번");
});

test("a learned negation cannot select its positive opposite or infer an untaught alternative", () => {
  const negation = "준비 상태는 CPU 할당을 기다리는 상태가 아니다.";
  assert.equal(groundedChoice(choices, [negation]), null);
  assert.equal(groundedChoice([choices[0], `② ${negation}`, choices[2], choices[3]], [negation]), "②");
});

test("wrong knowledge requires a persisted quote, a directly derived answer and confirmed contradiction", () => {
  const base = { answer: answerFromQuote(wrong), evidenceQuote: wrong, taught: [{ content: wrong }] };
  assert.equal(groundedErrorReason({ ...base, contradictsSource: true }), "WRONG_KNOWLEDGE");
  assert.equal(groundedErrorReason({ ...base, proposed: "WRONG_KNOWLEDGE", contradictsSource: false }), "UNKNOWN");
  assert.equal(groundedErrorReason({ ...base, answer: correct, contradictsSource: true }), "UNKNOWN");
  assert.equal(groundedErrorReason({ ...base, taught: [], contradictsSource: true }), "UNKNOWN");
  assert.equal(groundedErrorReason({ ...base, answer: "배우지 못한 내용이라 답을 쓸 수 없음." }), "INSUFFICIENT_LEARNING");
  assert.equal(groundedErrorReason({ ...base, answer: "2번", choices, wrongObjective: true }), "WRONG_KNOWLEDGE");
  assert.equal(groundedErrorReason({ ...base, answer: "2번", choices, wrongObjective: true, unlearned: true }), "INSUFFICIENT_LEARNING");
});

test("diagnosis uses only the verified cause label while preserving its explanatory detail", () => {
  const detail = "상태의 정의와 기다리는 대상을 다시 확인하세요.";
  const proposed = `${LEARNING_ERROR_LABELS.WRONG_KNOWLEDGE} ${detail}`;
  assert.equal(groundedDiagnosis(proposed, "UNKNOWN"), `${LEARNING_ERROR_LABELS.UNKNOWN} ${detail}`);
  const mixed = `${Object.values(LEARNING_ERROR_LABELS).join(" ")} ${LEARNING_ERROR_LABELS.WRONG_KNOWLEDGE} ${detail}`;
  const verified = groundedDiagnosis(mixed, "INSUFFICIENT_LEARNING");
  assert.equal(verified, `${LEARNING_ERROR_LABELS.INSUFFICIENT_LEARNING} ${detail}`);
  for (const [reason, label] of Object.entries(LEARNING_ERROR_LABELS)) {
    assert.equal(verified.split(label).length - 1, Number(reason === "INSUFFICIENT_LEARNING"));
  }
});

test("live grading replaces an unsupported model blame label with the computed neutral cause", async () => {
  const detail = "CPU 배정 전에는 실행하지 않는다는 조건을 덧붙여 설명하세요.";
  const source = `${correct} 준비 상태에서는 CPU를 배정받기 전까지 실행하지 않는다.`;
  const model = createLiveLlm({ async completeJSON(_prompt, _user, schema) {
    return schema.parse({ qid: "q1", score: 50, verdict: "PARTIAL", comment: "대기 대상은 맞지만 실행 조건이 빠졌습니다.",
      rubricChecks: [true, false], contradictsSource: false,
      gap: { errorReason: "WRONG_KNOWLEDGE", title: "실행 조건", diagnosis: `${LEARNING_ERROR_LABELS.WRONG_KNOWLEDGE} ${detail}`,
        evidenceQuote: correct, concepts: ["준비 상태"], sourceExcerpt: correct },
    });
  }, async *streamText() { throw new Error("not used"); } });
  const events = await collect(model.gradeExam({ chapter: { title: "준비 상태", points: ["준비 상태"], text: source },
    questions: [{ qid: "q1", question: "준비 상태의 대기 대상과 실행 조건을 설명하시오.", points: 100, rubric: "CPU 할당 대기;배정 전 실행하지 않음" }],
    answers: [{ qid: "q1", answer: correct, sentences: [{ sentence: correct, ref: 7, level: "STRONG", unlearned: false }] }],
    taught: [{ ref: 7, content: correct }],
  }));
  const gap = events.find((event) => event.type === "gap");
  assert.equal(gap?.errorReason, "UNKNOWN");
  assert.equal(gap?.diagnosis, `${LEARNING_ERROR_LABELS.UNKNOWN} ${detail}`);
  assert.ok(!gap?.diagnosis.includes(LEARNING_ERROR_LABELS.WRONG_KNOWLEDGE));
  assert.equal(gap?.evidenceQuote, correct);
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
  assert.equal(answerFromQuote("준비 상태는 입출력이 끝나기를 기다리는 상태야."), "준비 상태는 입출력이 끝나기를 기다리는 상태다.");
  assert.equal(answerFromQuote("- **준비 상태는 입출력을 기다리는 상태야.**"), "- 준비 상태는 입출력을 기다리는 상태다.");
});
