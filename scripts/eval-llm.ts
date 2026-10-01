import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { llm, type Llm, type TaughtMsg } from "../src/lib/llm";
import { providerName } from "../src/lib/llm/provider";
import { CHARACTERS, type JuniorCharacter } from "../src/contracts/game";
import { DEMO_COMPLETE_EXPLANATION } from "../src/lib/llm/fixtures/demo-script";

// Offline is the reproducible default. Explicit openai/anthropic selections run
// those actual providers and fail on missing credentials; they never fall back.
process.env.LLM_PROVIDER ??= "stub";
process.env.LLM_STUB_DELAY_MS ??= "0";

type FixtureChapters = Awaited<ReturnType<Llm["generateChapters"]>> & { fileName: string; sourceId: string };
type Demo = {
  chapterIndex: number;
  wrongExplanation: string;
  taught: TaughtMsg[];
};

async function json<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), "fixtures", name), "utf8")) as T;
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const output: T[] = [];
  for await (const event of events) output.push(event);
  return output;
}

async function evaluateFixture(domain: "os" | "economics") {
  const metadata = await json<FixtureChapters>(`chapters.${domain}.json`);
  const demo = await json<Demo>(`demo.${domain}.json`);
  const text = await readFile(path.join(process.cwd(), "fixtures", metadata.fileName), "utf8");
  assert.ok(text.length >= 6_000 && text.length <= 10_000, "fixture 자료는 6~10k자");

  const generated = await llm.generateChapters({ sources: [{ sourceId: metadata.sourceId, text }] });
  assert.ok(generated.chapters.length >= 4 && generated.chapters.length <= 12, "(a) 챕터 수 4~12");
  let offset = 0;
  for (const chapter of generated.chapters) {
    assert.equal(chapter.sourceId, metadata.sourceId);
    assert.equal(chapter.startOffset, offset, "원문 범위의 겹침·누락 없음");
    assert.ok(Number.isInteger(chapter.endOffset) && chapter.endOffset <= text.length);
    assert.ok(chapter.endOffset - chapter.startOffset >= 300 && chapter.endOffset - chapter.startOffset <= 4_000);
    assert.ok(chapter.title.length <= 20 && chapter.points.length >= 2 && chapter.points.length <= 4);
    assert.ok(chapter.points.every((point) => point.length <= 15));
    offset = chapter.endOffset;
  }
  assert.equal(offset, text.length);

  // Canonical fixture boundaries keep the same material facts under evaluation
  // even when a live P1 chooses different, equally valid chapter boundaries.
  const selected = metadata.chapters[demo.chapterIndex];
  const chapter = { title: selected.title, points: selected.points, text: text.slice(selected.startOffset, selected.endOffset) };
  const prepared = await llm.prepareSession({ chapter, level: "EASY" });
  assert.equal(prepared.questions.length, 3, "(b) 시험 문항 3개");
  assert.equal(prepared.questions.reduce((sum, question) => sum + question.points, 0), 100, "(b) 배점 합 100");
  assert.equal(new Set(prepared.questions.map((question) => question.qid)).size, 3);

  const history: Parameters<Llm["juniorTurn"]>[0]["history"] = [];
  const wrongTurn = await collect(llm.juniorTurn({
    chapter, level: "EASY", objectives: prepared.objectives, heardConcepts: [], history,
    explanation: demo.wrongExplanation,
  }));
  assert.ok(wrongTurn.some((event) => event.type === "doubt"), "(c) 틀린 설명에 doubt 발생");
  assert.ok(!wrongTurn.some((event) => event.type === "question" || event.type === "reaction"));
  for (const event of wrongTurn) if (event.type === "concepts") assert.deepEqual(event.heardConcepts, []);

  let heardConcepts: string[] = [];
  for (const taught of demo.taught) {
    if (taught.content === demo.wrongExplanation) {
      history.push({ role: "USER", stage: "ANSWER", content: taught.content });
      for (const event of wrongTurn) if (event.type === "doubt") history.push({ role: "JUNIOR", stage: "DOUBT", content: event.content });
      continue;
    }
    const turn = await collect(llm.juniorTurn({ chapter, level: "EASY", objectives: prepared.objectives, heardConcepts, history, explanation: taught.content }));
    assert.ok(turn.some((event) => event.type === "reaction"), "바른 설명에는 반응 생성");
    assert.ok(turn.some((event) => event.type === "question"), "바른 설명에는 다음 질문 생성");
    for (const event of turn) if (event.type === "concepts") heardConcepts = event.heardConcepts;
    history.push({ role: "USER", stage: "ANSWER", content: taught.content });
    for (const event of turn) {
      if (event.type === "reaction" || event.type === "question") history.push({ role: "JUNIOR", stage: event.type.toUpperCase(), content: event.content });
    }
  }

  const answers: { qid: string; answer: string }[] = [];
  for (const question of prepared.questions) {
    const events = await collect(llm.writeExamAnswer({ question: question.question, taught: demo.taught, heardConcepts }));
    const final = events.find((event) => event.type === "final");
    assert.ok(final?.type === "final" && final.answer.trim());
    const sentences = events.filter((event) => event.type === "sentence");
    assert.ok(sentences.length >= 1 && sentences.length <= 4);
    for (const sentence of sentences) {
      assert.ok(sentence.ref === null || demo.taught.some((taught) => taught.ref === sentence.ref));
      if (sentence.ref === null) assert.ok(sentence.unlearned && sentence.level === "NONE");
    }
    if (question.order === 3) assert.ok(sentences.every((sentence) => sentence.unlearned), "(d) 안 가르친 세 번째 문항은 unlearned");
    answers.push({ qid: question.qid, answer: final.answer });
  }

  const grading = await collect(llm.gradeExam({ chapter, questions: prepared.questions, answers, taught: demo.taught }));
  const grades = grading.filter((event) => event.type === "grade");
  const gaps = grading.filter((event) => event.type === "gap");
  assert.equal(grades.length, 3);
  assert.equal(new Set(grades.map((grade) => grade.qid)).size, 3);
  for (const grade of grades) {
    const question = prepared.questions.find((item) => item.qid === grade.qid)!;
    assert.ok(Number.isInteger(grade.score) && grade.score >= 0 && grade.score <= question.points);
    assert.equal(grade.maxScore, question.points);
    assert.equal(gaps.filter((gap) => gap.qid === grade.qid).length, grade.verdict === "CORRECT" ? 0 : 1);
  }
  for (const gap of gaps) {
    assert.ok(chapter.text.includes(gap.sourceExcerpt), "자료 발췌가 실제 본문에 존재");
    assert.ok(!gap.evidenceQuote || demo.taught.some((taught) => taught.content.includes(gap.evidenceQuote)));
  }
  const total = grades.reduce((sum, grade) => sum + grade.score, 0);
  assert.ok(total >= 0 && total <= 100, "(e) 총점 0~100");
  const outcomes = {
    correct: grades.filter((grade) => grade.verdict === "CORRECT").length,
    partial: grades.filter((grade) => grade.verdict === "PARTIAL").length,
    wrong: grades.filter((grade) => grade.verdict === "WRONG").length,
  };
  console.log(`${domain}: PASS | chapters=${generated.chapters.length}, questions=${prepared.questions.length}, doubt=yes, q3=unlearned, score=${total}/100, correct=${outcomes.correct}, partial=${outcomes.partial}, wrong=${outcomes.wrong}, gaps=${gaps.length}`);
}

async function evaluatePersonas() {
  const metadata = await json<FixtureChapters>("chapters.economics.json");
  const text = await readFile(path.join(process.cwd(), "fixtures", metadata.fileName), "utf8");
  const first = metadata.chapters[0];
  const chapter = { title: "수요의 이해", points: ["수요량과 수요", "수요 법칙", "곡선 위 이동 vs 이동"],
    text: text.slice(first.startOffset, first.endOffset) };
  for (const persona of Object.keys(CHARACTERS) as JuniorCharacter[]) {
    const spec = CHARACTERS[persona];
    const prepared = await llm.prepareSession({ chapter, level: spec.level, persona, examFormat: spec.examFormat });
    assert.equal(prepared.questions.length, 3);
    assert.equal(prepared.questions.every((question) => question.choices?.length === 4), spec.examFormat === "OBJECTIVE");
    for (const [label, content, expectedPass] of [
      ["pass", DEMO_COMPLETE_EXPLANATION, true], ["fail", "아직 잘 모르겠어.", false],
    ] as const) {
      const taught = [{ ref: 1, content }];
      const answers = [];
      for (const question of prepared.questions) {
        const events = await collect(llm.writeExamAnswer({ question: question.question, taught, heardConcepts: [], persona, choices: question.choices }));
        const final = events.find((event) => event.type === "final");
        assert.ok(final?.type === "final");
        answers.push({ qid: question.qid, answer: final.answer });
      }
      const events = await collect(llm.gradeExam({ chapter, questions: prepared.questions, answers, taught, persona }));
      const grades = events.filter((event) => event.type === "grade");
      const gaps = events.filter((event) => event.type === "gap");
      assert.equal(grades.length, 3);
      assert.equal(gaps.length, grades.filter((grade) => grade.verdict !== "CORRECT").length);
      const score = grades.reduce((sum, grade) => sum + grade.score, 0);
      assert.equal(score >= spec.passScore, expectedPass, `${persona} ${label} score=${score}`);
      console.log(`${persona} ${label}: ${score}/100 (${spec.passScore} pass line)`);
    }
  }
}

async function main() {
  console.log(`LLM evaluation provider=${providerName()}${providerName() === "stub" ? " (offline fixtures; live provider quality is not verified)" : " (live API)"}`);
  await evaluateFixture("os");
  await evaluateFixture("economics");
  await evaluatePersonas();
  console.log("PASS: 2/2 fixture materials and 3 personas × pass/fail cases.");
}

void main().catch((error: unknown) => {
  console.error("LLM evaluation FAILED:", error instanceof Error ? error.message : "알 수 없는 오류");
  process.exitCode = 1;
});
