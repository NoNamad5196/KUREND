import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHARACTERS } from "@/contracts/game";
import { examChoiceIndex, formatExamQuestion } from "@/lib/shared/exam-format";
import { normalizeText } from "@/lib/server/ingest";
import chapters from "../../../../fixtures/chapters.economics.json";
import { createLiveLlm } from "../live";
import { stubLlm } from "../stub";
import { prepareSessionSchemaFor } from "../schemas";
import { sourceLearningConcepts } from "../learning-plan";
import { objectiveTopic, matchQuestionObjective } from "../teaching-choices";
import { DEMO_COMPLETE_EXPLANATION } from "../fixtures/demo-script";
import type { Llm } from "../types";

process.env.LLM_STUB_DELAY_MS = "0";
const source = readFileSync(new URL("../../../../fixtures/economics.md", import.meta.url), "utf8");
const chapter = { ...chapters.chapters[0], text: source.slice(chapters.chapters[0].startOffset, chapters.chapters[0].endOffset) };
async function collect<T>(events: AsyncIterable<T>): Promise<T[]> { const result: T[] = []; for await (const event of events) result.push(event); return result; }

test("live question context excludes persona and yields five independently sourced targets", async () => {
  for (const persona of ["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const) {
    const prepared = await stubLlm.prepareSession({ chapter, persona, level: CHARACTERS[persona].level });
    const concepts = sourceLearningConcepts(chapter, 5, prepared.objectives.map(objectiveTopic));
    const llm = createLiveLlm({ async completeJSON(prompt, input, schema) {
      const parsed = JSON.parse(input);
      assert.equal(parsed.persona, undefined);
      assert.equal(parsed.voice, undefined);
      assert.equal(parsed.questionCount, 5);
      assert.match(prompt, /firstQuestion이나 캐릭터 대사는 생성하지 마세요/u);
      return schema.parse({ questions: prepared.questions,
        objectives: prepared.objectives.map((objective, index) => ({ ...objective, sourceQuote: concepts[index].sourceQuote })) });
    }, async *streamText() { throw new Error("unused"); } });
    const result = await llm.prepareSession({ chapter, persona, level: CHARACTERS[persona].level });
    assert.equal(result.objectives.length, 5);
    assert.deepEqual(result.questions.map((question) => question.objectiveRef), result.objectives.map((objective) => objective.id));
    assert.ok(result.objectives.every((objective) => !Object.hasOwn(objective, "sourceQuote")), "private source evidence must not leak into learning targets");
    for (const question of result.questions) assert.doesNotMatch(question.question, /선배|인가요|같아요|해주실래|\*\*/u);
  }
});

test("preparation rejects recycled targets, duplicate questions and fabricated source evidence", async () => {
  const prepared = await stubLlm.prepareSession({ chapter, level: "EASY", persona: "FEMALE_NORMAL" });
  const schema = prepareSessionSchemaFor(5);
  assert.throws(() => schema.parse({ ...prepared, objectives: prepared.objectives.slice(0, 3) }));
  assert.throws(() => schema.parse({ ...prepared, questions: prepared.questions.map((question) => ({ ...question, objectiveRef: "o1" })) }));
  assert.throws(() => schema.parse({ ...prepared, objectives: prepared.objectives.map((objective) => ({ ...objective, text: "동일 개념을 설명할 수 있다" })) }));
  assert.throws(() => schema.parse({ ...prepared, questions: prepared.questions.map((question) => ({ ...question, question: "같은 개념을 설명하시오." })) }));
  assert.throws(() => prepareSessionSchemaFor(5, [], chapter.text).parse({ ...prepared,
    objectives: prepared.objectives.map((objective) => ({ ...objective, sourceQuote: "자료에 없는 사실" })) }));
  assert.equal(formatExamQuestion("선배님~ **준비 상태**는 무엇인가요?"), "준비 상태는 무엇인지 설명하시오.");
});

test("number-only answers retain learned evidence and unknown guesses score zero after serialization", async () => {
  const question = { qid: "q1", question: "가격과 수요량의 올바른 관계를 고르시오.", points: 100,
    rubric: "정답 ①;근거: 가격 상승 시 수요량 감소", choices: ["① 가격이 오르면 수요량은 줄어든다.", "② 수요량은 늘어난다.", "③ 무관하다.", "④ 항상 일정하다."] };
  const taught = [{ ref: 1, content: "가격이 오르면 수요량은 줄어든다." }];
  const live = createLiveLlm({ async completeJSON(_prompt, input, schema) {
    const parsed = JSON.parse(input);
    if (parsed.question && typeof parsed.question === "string") return schema.parse({ choice: "①", thought: "근거 확인",
      sentences: [{ ref: 1, quote: taught[0].content, level: "STRONG" }], unlearned: false });
    return schema.parse({ gap: { title: "미학습", diagnosis: "학습한 근거가 없습니다.", evidenceQuote: "", concepts: ["수요 법칙"], sourceExcerpt: chapter.text.slice(0, 40) } });
  }, async *streamText() { throw new Error("unused"); } });
  for (const llm of [stubLlm, live]) {
    for (const known of [true, false]) {
      const evidence = known ? taught : [];
      const output = await collect(llm.writeExamAnswer({ question: question.question, choices: question.choices, taught: evidence, heardConcepts: [], persona: "FEMALE_NORMAL" }));
      const answer = output.find((event) => event.type === "final")!.answer;
      assert.equal(answer, "1번");
      const sentences = output.flatMap((event) => event.type === "sentence" ? [{ sentence: event.text, ref: event.ref, level: event.level, unlearned: event.unlearned }] : []);
      assert.equal(sentences.length, 1);
      assert.equal(sentences[0].unlearned, !known);
      const saved: Parameters<Llm["gradeExam"]>[0]["answers"] = JSON.parse(JSON.stringify([{ qid: "q1", answer, sentences }]));
      const grades = await collect(llm.gradeExam({ chapter, questions: [question], answers: saved, taught: evidence }));
      assert.equal(grades.find((event) => event.type === "grade")!.score, known ? 100 : 0);
      if (llm === stubLlm && !known) assert.match(grades.find((event) => event.type === "grade")!.comment, /학습한 근거가 없어/u);
      assert.equal(examChoiceIndex(answer), 0);
    }
  }
});

test("exam answer presentation is identical across personas and cannot use a fabricated text field", async () => {
  const quote = "선배님, 준비 상태는 CPU 할당을 기다리는 상태야.";
  const llm = createLiveLlm({ async completeJSON(_prompt, input, schema) {
    assert.equal(JSON.parse(input).persona, undefined);
    return schema.parse({ thought: "근거 확인", sentences: [{ quote, ref: 1, level: "STRONG", text: "외부 지식과 허위 사실",
      answer: "준비 상태는 CPU 할당을 기다리지 않는 상태다." }], unlearned: false });
  }, async *streamText() { throw new Error("unused"); } });
  for (const persona of ["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const) {
    const output = await collect(llm.writeExamAnswer({ question: "준비 상태를 설명하시오.", taught: [{ ref: 1, content: quote }], heardConcepts: [], persona }));
    const answer = output.find((event) => event.type === "final")!.answer;
    assert.equal(answer, "준비 상태는 CPU 할당을 기다리는 상태다.");
    assert.doesNotMatch(answer, /선배|제 생각|배웠습니다|\*\*|허위|외부 지식|기다리지 않는/u);
    assert.deepEqual(output.find((event) => event.type === "sources")?.sources, [{ ref: 1, content: quote }]);
  }
});

test("five source-taught concepts produce five credited answers without matching question boilerplate", async () => {
  const taught = [
    { ref: 1, content: DEMO_COMPLETE_EXPLANATION },
    { ref: 4, content: "수요는 일정 기간 동안 소비자가 각 가격에서 구입할 의사와 능력이 있는 수량의 관계다." },
    { ref: 7, content: "수요량은 그 관계에서 특정 가격에 대응하는 하나의 수량이다." },
  ];
  for (const persona of ["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const) {
    const prepared = await stubLlm.prepareSession({ chapter, persona, level: CHARACTERS[persona].level });
    const answers: Parameters<Llm["gradeExam"]>[0]["answers"] = [];
    for (const question of prepared.questions) {
      const events = await collect(stubLlm.writeExamAnswer({ question: question.question, choices: question.choices, taught, heardConcepts: [] }));
      const final = events.find((event) => event.type === "final")!;
      const sentences = events.flatMap((event) => event.type === "sentence" ? [{ sentence: event.text, ref: event.ref, level: event.level, unlearned: event.unlearned }] : []);
      assert.ok(sentences.every((sentence) => !sentence.unlearned), JSON.stringify({ persona, question, sentences }));
      if (question.order === 4) assert.equal(sentences[0].ref, 4);
      if (question.order === 5) assert.equal(sentences[0].ref, 7);
      answers.push({ qid: question.qid, answer: final.answer, sentences });
    }
    const grades = (await collect(stubLlm.gradeExam({ chapter, questions: prepared.questions, answers, taught }))).filter((event) => event.type === "grade");
    assert.equal(grades.length, 5);
    assert.ok(grades.every((grade) => grade.verdict === "CORRECT"), JSON.stringify({ persona, grades }));
    assert.equal(grades.reduce((total, grade) => total + grade.score, 0), 100);
  }
});

test("teaching a similarly named concept does not supply the missing definition or a lucky exam answer", async () => {
  const taught = [{ ref: 3, content: "수요량은 그 관계에서 특정 가격에 대응하는 하나의 수량이다." }];
  for (const persona of ["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const) {
    const prepared = await stubLlm.prepareSession({ chapter, persona, level: CHARACTERS[persona].level });
    for (const question of prepared.questions.slice(3)) {
      const events = await collect(stubLlm.writeExamAnswer({ question: question.question, choices: question.choices, taught, heardConcepts: [] }));
      const final = events.find((event) => event.type === "final")!;
      const sentences = events.flatMap((event) => event.type === "sentence" ? [{ sentence: event.text, ref: event.ref, level: event.level, unlearned: event.unlearned }] : []);
      const known = question.order === 5;
      assert.equal(sentences.every((sentence) => sentence.unlearned), !known);
      assert.equal(sentences[0].ref, known ? 3 : null);
      const saved = JSON.parse(JSON.stringify([{ qid: question.qid, answer: final.answer, sentences }]));
      const grades = await collect(stubLlm.gradeExam({ chapter, questions: [question], answers: saved, taught }));
      assert.equal(grades.find((event) => event.type === "grade")!.score, known ? question.points : 0);
    }
  }
});

test("uploaded sample supports labelled definitions, natural repetitions and compound Korean particles through all five exams", async () => {
  const text = normalizeText(readFileSync(new URL("../../../../public/samples/economics.md", import.meta.url), "utf8"));
  const generated = await stubLlm.generateChapters({ sources: [{ sourceId: "uploaded-sample", text }] });
  const first = generated.chapters[0];
  const uploaded = { ...first, text: text.slice(first.startOffset, first.endOffset) };
  for (const persona of ["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const) {
    const level = CHARACTERS[persona].level;
    const prepared = await stubLlm.prepareSession({ chapter: uploaded, persona, level });
    assert.deepEqual(prepared.objectives.map(objectiveTopic), ["수요", "수요량", "수요 법칙", "개인 수요", "시장 수요"]);
    const concepts = sourceLearningConcepts(uploaded, 5, prepared.objectives.map(objectiveTopic));
    const history: Parameters<Llm["juniorTurn"]>[0]["history"] = [{ role: "JUNIOR", stage: "QUESTION", content: prepared.firstQuestion }];
    const taught: Parameters<Llm["gradeExam"]>[0]["taught"] = [];
    const askedObjectives = new Set<string>();
    let mastery: Parameters<Llm["juniorTurn"]>[0]["mastery"];
    let heardConcepts: string[] = [];
    let choices = prepared.firstTeachingChoices;
    for (const [index, concept] of concepts.entries()) {
      const explanations = persona === "MALE_EASY"
        ? [choices![0].text]
        : [`${concept.topic}: ${concept.sourceQuote}`, ...(persona === "KU_HARD" ? [`다시 정리하면, ${concept.sourceQuote} 즉 ${concept.topic}의 의미는 이와 같습니다.`] : [])];
      for (const [repeat, explanation] of explanations.entries()) {
        const actualQuestion = history.filter((message) => message.role === "JUNIOR" && message.stage === "QUESTION").at(-1)!;
        const asked = matchQuestionObjective(prepared.objectives, actualQuestion.content);
        if (repeat === 0 || !mastery?.some((entry) => entry.concept === concept.topic && entry.mastery === 100)) {
          assert.equal(asked?.id, prepared.objectives[index].id, "Every selected concept must receive an actual learning question");
        }
        if (asked) askedObjectives.add(asked.id);
        const events = await collect(stubLlm.juniorTurn({ chapter: uploaded, level, persona, objectives: prepared.objectives, history, explanation, mastery, heardConcepts }));
        const question = events.find((event) => event.type === "question")!;
        assert.ok(question, JSON.stringify(events));
        const expected = persona === "KU_HARD" && repeat === 0 ? index : index + 1;
        for (const objective of prepared.objectives.slice(0, expected)) assert.ok(question.coveredObjectives.includes(objective.id));
        assert.ok(question.coveredObjectives.every((id) => prepared.objectives.some((objective) => objective.id === id)),
          "A source sentence can teach multiple definitions together, but cannot invent an objective");
        history.push({ role: "USER", stage: "ANSWER", content: explanation }, { role: "JUNIOR", stage: "QUESTION", content: question.content });
        taught.push({ ref: taught.length + 1, content: explanation });
        mastery = question.mastery;
        heardConcepts = events.find((event) => event.type === "concepts")!.heardConcepts;
        choices = question.teachingChoices;
      }
    }
    assert.equal(mastery!.filter((entry) => entry.mastery === 100).length, 5);
    assert.equal(askedObjectives.size, 5, "Five mastered targets still require five distinct learning questions");
    const answers: Parameters<Llm["gradeExam"]>[0]["answers"] = [];
    for (const question of prepared.questions) {
      if (question.order === 5 && question.choices) {
        const key = examChoiceIndex(question.rubric.match(/^정답 ([①②③④])/u)![1]);
        assert.ok(question.choices[key].includes("시장 수요는"), "The correct option must use the selected concept definition, never an unrelated document introduction");
      }
      const events = await collect(stubLlm.writeExamAnswer({ question: question.question, choices: question.choices, taught, heardConcepts }));
      const sentences = events.flatMap((event) => event.type === "sentence" ? [{ sentence: event.text, ref: event.ref, level: event.level, unlearned: event.unlearned }] : []);
      assert.ok(sentences.every((sentence) => !sentence.unlearned), question.question);
      answers.push({ qid: question.qid, answer: events.find((event) => event.type === "final")!.answer, sentences });
    }
    const grades = (await collect(stubLlm.gradeExam({ chapter: uploaded, questions: prepared.questions, answers, taught }))).filter((event) => event.type === "grade");
    assert.equal(grades.reduce((total, grade) => total + grade.score, 0), 100, JSON.stringify({ persona, grades }));
  }
});
