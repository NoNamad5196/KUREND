// Supplement to pnpm eval:llm: exercises the economics §10 dialogue and P6.
// LLM_PROVIDER=stub node --import tsx fixtures/eval-demo.ts
// LLM_PROVIDER=openai node --import tsx fixtures/eval-demo.ts --require-live
// Keep credentials in the local .env; never pass their values on the command line.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { llm, type Llm, type TaughtMsg } from "../src/lib/llm";
import { providerName } from "../src/lib/llm/provider";

process.env.LLM_PROVIDER ??= "stub";
process.env.LLM_STUB_DELAY_MS ??= "0";

type FixtureChapters = Awaited<ReturnType<Llm["generateChapters"]>> & { fileName: string };
type Demo = { chapterIndex: number; wrongExplanation: string; taught: TaughtMsg[] };
type TurnEvent = ReturnType<Llm["juniorTurn"]> extends AsyncIterable<infer E> ? E : never;
type Measurement = { phase: string; ms: number; targetMs: number; budgetMs: number };
const measurements: Measurement[] = [];

function budget(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  assert.ok(Number.isFinite(parsed) && parsed > 0, `${name} must be a positive number`);
  return parsed;
}

async function measured<T>(phase: string, targetMs: number, budgetMs: number, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    const ms = Math.round(performance.now() - start);
    measurements.push({ phase, ms, targetMs, budgetMs });
    console.log(`timing: ${phase}=${ms}ms target=${targetMs}ms budget=${budgetMs}ms`);
  }
}

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), "fixtures", name), "utf8")) as T;
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
}

// Count outer sentences: a period inside a quoted source is not the end of
// the surrounding tutor sentence, and a decimal point is not a boundary.
function outerSentences(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "“" || character === '"') quoted = !quoted;
    if (character === "”") quoted = false;
    const decimal = character === "." && /\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? "");
    if (!quoted && !decimal && /[.!?。！？]/u.test(character)) {
      result.push(text.slice(start, index + 1).trim());
      start = index + 1;
    }
  }
  if (text.slice(start).trim()) result.push(text.slice(start).trim());
  return result.filter(Boolean);
}

function appendTurn(history: Parameters<Llm["juniorTurn"]>[0]["history"], explanation: string, events: TurnEvent[]) {
  history.push({ role: "USER", stage: "ANSWER", content: explanation });
  for (const event of events) {
    if (event.type === "doubt" || event.type === "reaction" || event.type === "question") {
      history.push({ role: "JUNIOR", stage: event.type.toUpperCase(), content: event.content });
    }
  }
}

async function main() {
  const provider = providerName();
  if (process.argv.includes("--require-live")) assert.notEqual(provider, "stub", "--require-live requires openai or anthropic; stub is not live validation");
  console.log(`Demo evaluation provider=${provider} (${provider === "stub" ? "offline; does not verify live quality or latency" : "actual API calls; no stub fallback"})`);
  const prepareBudget = budget("LLM_DEMO_PREPARE_BUDGET_MS", 18_000);
  const turnBudget = budget("LLM_DEMO_TURN_BUDGET_MS", 10_000);
  const metadata = await fixture<FixtureChapters>("chapters.economics.json");
  const demo = await fixture<Demo>("demo.economics.json");
  const source = await readFile(path.join(process.cwd(), "fixtures", metadata.fileName), "utf8");
  const selected = metadata.chapters[demo.chapterIndex];
  const chapter = { title: selected.title, points: selected.points, text: source.slice(selected.startOffset, selected.endOffset) };
  const prepared = await measured("prepare", 15_000, prepareBudget, () => llm.prepareSession({ chapter, level: "EASY" }));
  assert.equal(prepared.objectives.length, 3);
  assert.equal(prepared.questions.length, 3);
  assert.equal(new Set(prepared.objectives.map((objective) => objective.id)).size, 3);
  assert.equal(new Set(prepared.questions.map((question) => question.qid)).size, 3);
  assert.equal(prepared.questions.reduce((sum, question) => sum + question.points, 0), 100);
  const questions = [...prepared.questions].sort((left, right) => left.order - right.order);
  assert.deepEqual(questions.map((question) => question.order), [1, 2, 3]);
  for (const [index, question] of questions.entries()) {
    assert.equal(question.objectiveRef, prepared.objectives[index].id, "questions must follow the three chapter points");
    assert.ok(question.rubric.trim(), "every question needs a rubric");
  }

  const history: Parameters<Llm["juniorTurn"]>[0]["history"] = [];
  let heardConcepts: string[] = [];
  const turn = (explanation: string, phase: string) => measured(phase, 8_000, turnBudget, () => collect(llm.juniorTurn({
    chapter, level: "EASY", objectives: prepared.objectives, heardConcepts, history, explanation,
  })));
  const wrong = await turn(demo.wrongExplanation, "turn.wrong");
  const doubt = wrong.find((event) => event.type === "doubt");
  assert.ok(doubt?.type === "doubt" && /[?？]/u.test(doubt.content), "a wrong claim must receive a question");
  assert.ok(!wrong.some((event) => event.type === "reaction" || event.type === "question"));
  assert.ok(!/역관계|반대\s*방향|수요량.{0,12}(줄|감소)|수요곡선|소득|기호|소비자\s*수/u.test(doubt.content), "doubt must not supply the economics correction or untaught facts");
  const wrongConcepts = wrong.find((event) => event.type === "concepts");
  assert.ok(wrongConcepts?.type === "concepts");
  assert.deepEqual(wrongConcepts.heardConcepts, []);
  assert.deepEqual(wrongConcepts.added, []);
  appendTurn(history, demo.wrongExplanation, wrong);

  const accepted = demo.taught.filter((message) => message.content !== demo.wrongExplanation);
  assert.equal(accepted.length, 2, "this scenario teaches exactly two of three points");
  const conceptTopics = [
    /수요\s*법칙|역관계|가격.*수요량|수요량.*가격/u,
    /수요량.*변화|수요곡선.*(위|이동)|곡선.*위/u,
  ];
  for (const [index, message] of accepted.entries()) {
    const events = await turn(message.content, `turn.correct.${index + 1}`);
    assert.ok(events.some((event) => event.type === "reaction"), "correct explanations need a reaction");
    assert.ok(!events.some((event) => event.type === "doubt"), "the fixture's correct explanation must not be rejected");
    const concepts = events.find((event) => event.type === "concepts");
    const question = events.find((event) => event.type === "question");
    assert.ok(concepts?.type === "concepts" && question?.type === "question");
    assert.ok(heardConcepts.every((concept) => concepts.heardConcepts.includes(concept)), "heard concepts must accumulate");
    assert.deepEqual(new Set(concepts.added), new Set(concepts.heardConcepts.filter((concept) => !heardConcepts.includes(concept))));
    assert.ok(concepts.heardConcepts.some((concept) => conceptTopics[index].test(concept)), "heard concepts must identify the explained topic");
    assert.ok(!concepts.heardConcepts.some((concept) => /결정요인|소득|기호|취향|소비자\s*수/u.test(concept)), "untaught demand determinants must not be learned");
    heardConcepts = concepts.heardConcepts;
    const expectedCovered = prepared.objectives.slice(0, index + 1).map((objective) => objective.id);
    assert.deepEqual(new Set(question.coveredObjectives), new Set(expectedCovered), "coverage must accumulate only explained objectives");
    assert.ok(question.content.includes(chapter.points[index + 1]), "next question must address the first untaught point");
    assert.ok(chapter.points.slice(0, index + 1).every((point) => !question.content.includes(point)), "next question must not ask an already covered point again");
    appendTurn(history, message.content, events);
    console.log(`dialogue: turn=${index + 1} concepts=${JSON.stringify(heardConcepts)} covered=${JSON.stringify(question.coveredObjectives)}`);
  }

  const answers: { qid: string; answer: string }[] = [];
  for (const [index, question] of questions.entries()) {
    const events = await collect(llm.writeExamAnswer({ question: question.question, taught: demo.taught, heardConcepts }));
    const sentences = events.filter((event) => event.type === "sentence");
    const final = events.find((event) => event.type === "final");
    assert.ok(final?.type === "final" && final.answer.trim());
    assert.ok(sentences.length >= 1 && sentences.length <= 4);
    assert.equal(final.answer, sentences.map((sentence) => sentence.text).join(" "));
    if (index === 2) {
      assert.ok(sentences.every((sentence) => sentence.unlearned && sentence.ref === null && sentence.level === "NONE"));
      assert.match(final.answer, /못\s*들|모르/u, "an untaught answer must acknowledge missing teaching");
    } else {
      for (const sentence of sentences) {
        assert.equal(sentence.unlearned, false);
        assert.equal(sentence.ref, accepted[index].ref, "learned answer must cite the relevant correction, not the earlier false claim");
        assert.notEqual(sentence.level, "NONE");
        const quote = sentence.text.match(/^“([\s\S]+)”라고 배웠습니다\.$/u)?.[1];
        assert.ok(quote && accepted[index].content.includes(quote), "answer statements must be exact taught quotes");
      }
    }
    answers.push({ qid: question.qid, answer: final.answer });
  }

  const grading = await collect(llm.gradeExam({ chapter, questions, answers, taught: demo.taught }));
  const grades = grading.filter((event) => event.type === "grade");
  const gaps = grading.filter((event) => event.type === "gap");
  assert.equal(grades.length, 3);
  assert.equal(new Set(grades.map((grade) => grade.qid)).size, 3);
  for (const [index, question] of questions.entries()) {
    const grade = grades.find((entry) => entry.qid === question.qid);
    assert.ok(grade);
    assert.equal(grade.maxScore, question.points);
    assert.equal(grade.score, index < 2 ? question.points : 0, "complete teaching earns the rubric points; untaught answers earn zero");
    assert.equal(grade.verdict, index < 2 ? "CORRECT" : "WRONG");
    assert.ok(grade.comment.trim());
    assert.equal(gaps.filter((gap) => gap.qid === question.qid).length, index < 2 ? 0 : 1);
  }
  for (const gap of gaps) {
    assert.ok(gap.sourceExcerpt.trim() && chapter.text.includes(gap.sourceExcerpt), "gap source must be a literal chapter excerpt");
    assert.ok(!gap.evidenceQuote || demo.taught.some((message) => message.content.includes(gap.evidenceQuote)), "gap teaching evidence must be a literal USER quote");
  }

  const gap = gaps.find((entry) => entry.qid === questions[2].qid);
  assert.ok(gap);
  const tutor = await collect(llm.tutorExplain({ chapter, gap, request: "못 들은 부분을 쉬운 비유 하나로 설명해 주세요." }));
  const tutorFinal = tutor.find((event) => event.type === "final");
  assert.ok(tutorFinal?.type === "final");
  assert.equal(tutor.filter((event) => event.type === "token").map((event) => event.token).join(""), tutorFinal.response);
  const sentences = outerSentences(tutorFinal.response);
  assert.ok(sentences.length >= 4 && sentences.length <= 6, `tutor must use 4–6 sentences, got ${sentences.length}`);
  assert.equal(sentences.filter((sentence) => /비유|빗대|예를\s*들|마치\s/u.test(sentence)).length, 1, "exactly one sentence must supply an explicit simple analogy");
  assert.ok(sentences[sentences.length - 1].startsWith("이것만 기억하면 됩니다: "));
  assert.equal(tutorFinal.response.split("이것만 기억하면 됩니다:").length - 1, 1);

  const exceeded = measurements.filter((measurement) => measurement.ms > measurement.budgetMs);
  assert.equal(exceeded.length, 0, `latency budget exceeded: ${exceeded.map((measurement) => `${measurement.phase} ${measurement.ms}ms > ${measurement.budgetMs}ms`).join(", ")}`);
  const score = grades.reduce((sum, grade) => sum + grade.score, 0);
  console.log(`PASS: economics §10 fixture checks, cumulative coverage=2/3, untaught=q3, rubric score=${score}/100, tutor=${sentences.length} sentences/1 analogy.`);
  console.log("Scope: semantic assertions cover this fixture's known topics and evidence; timing is one run, not a production latency guarantee.");
}

void main().catch((error: unknown) => {
  console.error("Demo evaluation FAILED:", error instanceof Error ? error.message : "알 수 없는 오류");
  process.exitCode = 1;
});
