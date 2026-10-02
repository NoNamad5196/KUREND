import { answerFromQuote, groundedChoice, groundedErrorReason } from "./exam-grounding";
import { LEARNING_ERROR_LABELS } from "@/lib/learning/error-reason";
import { isObjectiveQuestion, objectiveRefFor, pointsPlan, PRACTICE_QUESTION_COUNT, questionCountFor } from "@/contracts/game";
import { createHash } from "node:crypto";
import osChapters from "../../../fixtures/chapters.os.json";
import economicsChapters from "../../../fixtures/chapters.economics.json";
import osDemo from "../../../fixtures/demo.os.json";
import economicsDemo from "../../../fixtures/demo.economics.json";
import osTeacherNotes from "./fixtures/teacher-notes.os.json";
import econTeacherNotes from "./fixtures/teacher-notes.econ.json";
import type { ChapterText, Llm, TaughtMsg } from "./types";
import { personaFor, normalizePersonaAddress, personaQuestion } from "./personas";
import { objectiveTopic, teachingChoicesFor, isUnknownTeaching, explainedQuestionObjective, modelAnswersFor } from "./teaching-choices";
import { advanceMastery } from "./mastery";
import { UNLEARNED_ANSWER, hasLearnedAnswer } from "./text";
import { examChoiceIndex, formatExamChoice, formatExamQuestion } from "@/lib/shared/exam-format";
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import { sourceLearningConcepts } from "./learning-plan";
import { acceptedExplanations, nextLearningObjective } from "./turn-state";

type Yielded<T> = T extends AsyncIterable<infer E> ? E : never;
type TurnEvent = Yielded<ReturnType<Llm["juniorTurn"]>>;
type AnswerEvent = Yielded<ReturnType<Llm["writeExamAnswer"]>>;
type GradeEvent = Yielded<ReturnType<Llm["gradeExam"]>>;
type TutorEvent = Yielded<ReturnType<Llm["tutorExplain"]>>;
type Demo = typeof economicsDemo;
type Topic = { domain: "economics" | "os"; index: number; demo: Demo };
type GeneratedChapter = Awaited<ReturnType<Llm["generateChapters"]>>["chapters"][number];

const fixtures = [
  { domain: "economics" as const, chapters: economicsChapters, demo: economicsDemo },
  { domain: "os" as const, chapters: osChapters, demo: osDemo },
];
const unknownAnswer = UNLEARNED_ANSWER;

function delayMs(): number {
  const configured = process.env.LLM_STUB_DELAY_MS;
  if (configured === undefined) return 300;
  const value = Number(configured);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 5_000) : 300;
}

async function pause() {
  const delay = delayMs();
  if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

function matches(text: string, patterns: string[]) {
  return patterns.some((pattern) => new RegExp(pattern, "iu").test(text));
}

function demoFor(chapter: ChapterText): Demo | undefined {
  if (chapter.title === economicsChapters.chapters[0].title && chapter.text.includes("수요 법칙")) return economicsDemo;
  if (chapter.title === osChapters.chapters[0].title && chapter.text.includes("CPU 스케줄링")) return osDemo;
  return undefined;
}

function topicFor(question: string): Topic | undefined {
  for (const fixture of fixtures) {
    const index = fixture.demo.prepare.questions.findIndex((entry, i) =>
      entry.question === question || matches(question, fixture.demo.rubricChecks[i].questionPatterns),
    );
    if (index >= 0) return { domain: fixture.domain, index, demo: fixture.demo };
  }
  return undefined;
}

// Topic recognition never supplies an answer: all answer text below is quoted
// exclusively from the caller's already-filtered USER messages.
function relevantTo(topic: Topic, content: string): boolean {
  if (topic.domain === "economics") {
    if (topic.index === 0) return /가격/u.test(content) && (
      /수요량.{0,12}(늘|줄|증가|감소|반대|역관계)/u.test(content) ||
      /가격.{0,30}(더|덜)\s*(사|산)/u.test(content)
    );
    if (topic.index === 1) return /수요곡선/u.test(content) && /곡선\s*위|같은\s*수요곡선|동일한\s*수요곡선/u.test(content);
    return /소득|기호|취향|선호|소비자\s*수|학생\s*수|인구|대체재|보완재|관련\s*재화|기대/u.test(content) && /수요|곡선/u.test(content);
  }
  if (topic.index === 0) return /준비\s*(큐|상태)/u.test(content) && /CPU|프로세스/iu.test(content);
  if (topic.index === 1) return /선점|비선점/u.test(content);
  return /문맥\s*교환|디스패처|레지스터|프로그램\s*카운터/u.test(content);
}

const genericWords = new Set(["설명", "설명하세요", "무엇", "어떤", "어떻게", "관계", "비교", "개념", "핵심", "자료", "내용", "다음", "선배", "정리", "이유", "하나요", "있다", "있는", "한다"]);
function keywords(text: string): string[] {
  return [...new Set((text.match(/[가-힣A-Za-z0-9]{2,}/gu) ?? [])
    .map((word) => word.replace(/(에서는|으로는|이라는|이라고|에서|으로|이란|하는|한다|은|는|을|를|이|가|의|과|와)$/u, ""))
    .filter((word) => word.length >= 2 && !genericWords.has(word)))];
}

function genericTarget(question: string): string | undefined {
  const prompt = question.match(/^(.+?)의 의미와 자료(?:에 제시된|에서 제시한) 근거를 /u)?.[1];
  if (prompt) return prompt.trim();
  return /설명할 수 있다[.!?]?$/u.test(question) ? objectiveTopic({ text: question }) : undefined;
}

/** Korean particles may follow a concept, but a longer noun is another concept:
 * teaching 수요량 must not count as teaching the definition of 수요. */
function targetEvidenceScore(target: string, content: string): number {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
  const particle = "(?:에서는|에서도|에서|으로는|으로|이란|란|은|는|이|가|을|를|의|과|와|에|도|만|부터)";
  const mention = new RegExp(`(?:^|[^가-힣A-Za-z0-9])${escaped}(?=$|[^가-힣A-Za-z0-9]|${particle}(?:\\s|$))`, "iu");
  if (!mention.test(content) || content.trim().length <= target.length + 8) return 0;
  // Put the definition ahead of incidental mentions in a long explanation.
  const definition = new RegExp(`(?:^|[.!?。！？:：\\n]\\s*)(?:[-*+•]\\s*)?(?:(?:다시\\s*)?(?:정리하면|설명하면|말하면)[,，]\\s*)?${escaped}(?:이란|란|은|는)\\s`, "iu");
  return definition.test(content.trim()) ? 2 : 1;
}

function genericRelevant(question: string, content: string): boolean {
  const target = genericTarget(question);
  if (target) return targetEvidenceScore(target, content) >= (/\s/u.test(target) ? 1 : 2);
  const terms = keywords(question);
  const matched = terms.filter((term) => content.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
  return terms.length > 0 && matched.length >= Math.min(2, terms.length);
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu) ?? [text]).map((part) => part.trim()).filter(Boolean);
}

/** Rubric elements must describe facts in the source, not question boilerplate
 * such as "the meaning of X", which a correct definition need not repeat. */
function sourceRubric(sourceQuote: string): string {
  const sentences = splitSentences(sourceQuote).slice(0, 2).map((part) => part.replaceAll(";", ","));
  if (sentences.length > 1) return sentences.join(";");
  const sentence = sentences[0] ?? sourceQuote;
  const clauses = sentence.split(/,\s*/u).filter(Boolean);
  if (clauses.length > 1) return `${clauses[0]};${clauses.slice(1).join(", ")}`;
  const words = sentence.split(/\s+/u);
  const midpoint = Math.max(1, Math.floor(words.length / 2));
  return `${words.slice(0, midpoint).join(" ")};${words.slice(midpoint).join(" ")}`;
}

function selectedSources(question: string, taught: TaughtMsg[]): TaughtMsg[] {
  const topic = topicFor(question);
  const candidates = taught.filter((message) =>
    Number.isInteger(message.ref) && message.ref > 0 && message.content.trim().length > 0 && !isUnknownTeaching(message.content) &&
    (topic ? relevantTo(topic, message.content) : genericRelevant(question, message.content)),
  );
  // A later correction supersedes an earlier statement about the same topic.
  // References retain their original USER sequence number, including gaps.
  return candidates.length ? [candidates[candidates.length - 1]] : [];
}

function contradiction(chapter: ChapterText, content: string): "economics" | "os" | undefined {
  const sentences = splitSentences(content);
  if (/수요 법칙/u.test(chapter.text) && /가격.*수요량.*(줄|반대)/u.test(chapter.text)) {
    for (const sentence of sentences) {
      // Do not mistake quoted mistakes or negated claims for a contradiction.
      if (/틀렸|틀린|잘못|아니|않|거짓|오해|수정/u.test(sentence)) continue;
      // Check individual price clauses: a correct paired explanation such as
      // "가격이 오르면 줄고, 가격이 내리면 늘어" must not match across clauses.
      for (const clause of sentence.split(/[,;]|(?=가격)/u)) {
        if (/가격.{0,15}(오르|올라|상승|높아).{0,20}(수요량|수요).{0,12}(늘|증가|많)/u.test(clause) ||
            /가격.{0,15}(오르|올라|상승|높아).{0,15}더\s*(사|산)/u.test(clause) ||
            /가격.{0,15}(내리|내려|하락|낮아).{0,20}(수요량|수요).{0,12}(줄|감소|적)/u.test(clause)) return "economics";
      }
    }
  }
  if (/비선점형/u.test(chapter.text)) {
    for (const sentence of sentences) {
      if (/못|않|없|아니|틀렸|잘못/u.test(sentence)) continue;
      if (/비선점.{0,55}(강제로|회수|빼앗|뺏).{0,15}(수 있|가능)/u.test(sentence)) return "os";
    }
  }
  return undefined;
}

function chapterTopic(chapter: ChapterText, objective: { text: string }): Topic | undefined {
  const demo = demoFor(chapter);
  if (!demo) return undefined;
  const index = demo.prepare.objectives.findIndex((item) => objectiveTopic(item) === objectiveTopic(objective));
  if (index < 0) return undefined;
  return { domain: demo === economicsDemo ? "economics" : "os", index, demo };
}

function covered(chapter: ChapterText, objectives: { id: string; text: string }[], messages: string[]): string[] {
  return objectives.filter((objective) => {
    const topic = chapterTopic(chapter, objective);
    return messages.some((content) => topic ? relevantTo(topic, content) : genericRelevant(objective.text, content));
  }).map((objective) => objective.id);
}

function plainTitle(text: string, fallback: string): string {
  const heading = text.match(/^#{1,6}\s+(?:\d+\.\s*)?(.+)$/mu)?.[1];
  return (heading ?? fallback).trim().slice(0, 20);
}

function partition(source: { sourceId: string; text: string }, requested: number): GeneratedChapter[] {
  const { text } = source;
  const count = Math.max(Math.ceil(text.length / 4_000), Math.min(requested, Math.max(1, Math.floor(text.length / 300))));
  const boundaries = [...text.matchAll(/\n\s*\n/gu)].map((match) => match.index! + match[0].length);
  const result: GeneratedChapter[] = [];
  let start = 0;
  for (let index = 0; index < count; index++) {
    const remaining = count - index;
    const target = start + Math.round((text.length - start) / remaining);
    const minimum = Math.max(start + 300, text.length - (remaining - 1) * 4_000);
    const maximum = Math.min(start + 4_000, text.length - (remaining - 1) * 300);
    const possible = boundaries.filter((offset) => offset >= minimum && offset <= maximum);
    const end = remaining === 1 ? text.length : possible.reduce((best, offset) =>
      Math.abs(offset - target) < Math.abs(best - target) ? offset : best,
    possible[0] ?? Math.max(minimum, Math.min(target, maximum)));
    const title = plainTitle(text.slice(start, end), `자료의 핵심 ${index + 1}`);
    result.push({ title, points: [title.slice(0, 15), "핵심 내용과 근거"], sourceId: source.sourceId, startOffset: start, endOffset: end });
    start = end;
  }
  return result;
}

/** 받침 유무로 조사 고르기: josa("스레드", "을", "를") → "를". 한글이 아니면 받침 없음으로 본다(영문 약어 등). */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trim().at(-1) ?? "";
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return /[0-9LMNR]$/iu.test(last) ? withFinal : withoutFinal;
  return code % 28 ? withFinal : withoutFinal;
}

function findExcerpt(chapter: ChapterText, question: string): string {
  const topic = topicFor(question);
  const all = splitSentences(chapter.text).filter((sentence) => !sentence.startsWith("#"));
  // 인용 블록(> …)이나 아주 짧은 줄은 보기/근거로 쓰기 어렵다
  const body = all.filter((sentence) => !sentence.startsWith(">") && sentence.replace(/\s+/gu, "").length >= 15);
  const sentences = body.length ? body : all;
  const matchesTopic = sentences.filter((sentence) => topic ? relevantTo(topic, sentence) : genericRelevant(question, sentence));
  // One exact sentence is preferable to joining nonadjacent lines: callers
  // validate that sourceExcerpt is a literal substring of the chapter.
  const candidates = matchesTopic.length ? matchesTopic : sentences;
  if (topic) {
    const checks = topic.demo.rubricChecks[topic.index].checks;
    return [...candidates].sort((left, right) =>
      checks.filter((check) => matches(right, check.patterns)).length - checks.filter((check) => matches(left, check.patterns)).length,
    )[0] ?? chapter.text.trim();
  }
  const target = genericTarget(question);
  if (target) return [...candidates].sort((left, right) => targetEvidenceScore(target, right) - targetEvidenceScore(target, left))[0] ?? chapter.text.trim();
  return candidates[0] ?? chapter.text.trim();
}

function withObjectiveChoices<T extends { questions: { qid: string; order: number; points: number; question: string; objectiveRef: string; rubric: string }[] }>(prepared: T, chapter: ChapterText, only?: (index: number) => boolean): T & { questions: (T["questions"][number] & { choices?: string[] })[] } {
  return { ...prepared, questions: prepared.questions.map((item, index) => {
    if (only && !only(index)) return item;
    const objective = (prepared as T & { objectives?: { id: string; text: string }[] }).objectives?.find((entry) => entry.id === item.objectiveRef);
    const topic = objective ? objectiveTopic(objective) : item.question;
    const focused = teachingChoicesFor({ ...chapter, text: findExcerpt(chapter, item.question) }, topic);
    const options = focused.length === 4 ? focused : teachingChoicesFor(chapter, topic);
    if (options.length !== 4) throw new Error(`자료에 근거한 객관식 보기를 준비하지 못했습니다: ${topic}`);
    const marks = ["①", "②", "③", "④"];
    const correct = options.findIndex((option) => option.id === "teach_statement");
    return { ...item, question: `${item.question} 올바른 설명을 고르시오.`,
      choices: options.map((option, optionIndex) => `${marks[optionIndex]} ${stripMarkdownBold(option.text)}`),
      rubric: `정답 ${marks[correct]};근거: ${options[correct].text}` };
  }) };
}

export const stubLlm: Llm = {
  async generateTeachingChoices({ chapter, topic }) { return modelAnswersFor(chapter, topic); },
  async generateTeacherNote({ chapter }) {
    await pause();
    const fixture = { ...osTeacherNotes, ...econTeacherNotes } as Record<string, {
      mustTeach: string[]; keyTakeaways: string[]; confusing: string[]; likelyQuestions: string[];
    }>;
    if (fixture[chapter.title]) return structuredClone(fixture[chapter.title]);
    const points = chapter.points.filter(Boolean);
    const mustTeach = points.length >= 2 ? points.slice(0, 8) : [chapter.title, points[0] ?? "핵심 개념"];
    const sentences = splitSentences(chapter.text).filter((sentence) => sentence.length > 15 && !sentence.startsWith("#"));
    return {
      mustTeach,
      keyTakeaways: sentences.slice(0, 2).length === 2 ? sentences.slice(0, 2).map((sentence) => sentence.slice(0, 300)) : mustTeach.slice(0, 2).map((point) => `${point}${josa(point, "을", "를")} 자료에서 확인하세요.`),
      confusing: [`${mustTeach[0]}${josa(mustTeach[0], "과", "와")} ${mustTeach[1]}의 차이를 구분하세요.`],
      likelyQuestions: [`${mustTeach[0]}${josa(mustTeach[0], "은", "는")} 왜 필요한가요?`, `${mustTeach[1]}${josa(mustTeach[1], "은", "는")} 어떻게 다른가요?`],
    };
  },
  async generateChapters({ sources }) {
    if (!sources.length || sources.some((source) => !source.text.trim())) throw new Error("목차를 만들 자료의 본문이 필요합니다.");
    if (new Set(sources.map((source) => source.sourceId)).size !== sources.length) throw new Error("자료 ID가 중복되었습니다.");
    const total = sources.reduce((sum, source) => sum + source.text.length, 0);
    if (total < 1_200 || sources.some((source) => source.text.length < 300)) throw new Error("목차 4개를 만들려면 합계 1,200자 이상, 각 자료 300자 이상의 본문이 필요합니다.");
    if (total > 40_000) throw new Error("데모 모드의 자료는 합계 40,000자 이하여야 합니다.");
    await pause();
    const known = sources.map((source) => fixtures.find((fixture) =>
      fixture.chapters.sourceSha256 === createHash("sha256").update(source.text).digest("hex"),
    ));
    if (known.every(Boolean) && known.reduce((sum, fixture) => sum + fixture!.chapters.chapters.length, 0) <= 12) {
      return {
        title: known[0]!.chapters.title,
        chapters: known.flatMap((fixture, index) => fixture!.chapters.chapters.map((chapter) => ({
          ...chapter, points: [...chapter.points], sourceId: sources[index].sourceId,
        }))),
      };
    }
    const desired = Math.min(12, Math.max(4, sources.length, Math.ceil(total / 1_800)));
    const counts = sources.map(() => 1);
    for (let count = sources.length; count < desired; count++) {
      const index = sources.reduce((best, source, i) => source.text.length / counts[i] > sources[best].text.length / counts[best] ? i : best, 0);
      counts[index]++;
    }
    const chapters = sources.flatMap((source, index) => partition(source, counts[index]));
    if (chapters.length > 12) throw new Error("자료를 12개 이하의 목차로 나누기 어렵습니다. 자료를 나누어 업로드해 주세요.");
    return { title: plainTitle(sources[0].text, "학습 자료"), chapters };
  },

  async prepareSession({ chapter, level, persona, examFormat, questionCount, kind }) {
    await pause();
    const format = examFormat ?? personaFor(persona)?.examFormat ?? "DESCRIPTIVE";
    const count = Math.max(1, questionCount ?? (persona ? questionCountFor(persona) : PRACTICE_QUESTION_COUNT));
    const fixture = kind === "FINAL" ? undefined : demoFor(chapter);
    let base: { objectives: { id: string; text: string }[]; questions: { qid: string; order: number; points: number; question: string; objectiveRef: string; rubric: string }[]; firstQuestion: string };
    if (fixture) {
      base = structuredClone(fixture.prepare);
      if (level === "HARD") base.firstQuestion = `${objectiveTopic(base.objectives[0])}부터 말해 줘. 받아쓸게.`;
    } else {
      const points = [...chapter.points.slice(0, 3)];
      while (points.length < 3) points.push(points.length === 0 ? chapter.title : points.length === 1 ? "핵심 내용" : "개념 사이의 연결");
      base = {
        objectives: points.map((point, index) => ({ id: `o${index + 1}`, text: `${point}${josa(point, "을", "를")} 설명할 수 있다` })),
        questions: points.map((point, index) => ({
          qid: `q${index + 1}`, order: index + 1, points: 0,
          question: `${point}의 의미와 자료에서 제시한 근거를 설명하세요.`,
          objectiveRef: `o${index + 1}`, rubric: `${point}의 의미;자료 본문의 관련 근거`,
        })),
        firstQuestion: level === "EASY" ? `선배, ${points[0]}부터 알려줄래?` : `${points[0]}부터 말해 줘. 받아쓸게.`,
      };
    }
    if (persona) base.firstQuestion = personaQuestion(objectiveTopic(base.objectives[0]), persona, true);
    // Prepared legacy practice sessions keep their original three targets.
    // New sessions select source-grounded concepts rather than recycling o1-o3.
    const concepts = count === 3 && fixture
      ? base.objectives.map((objective, index) => ({ topic: objectiveTopic(objective), sourceQuote: findExcerpt(chapter, base.questions[index].question) }))
      : sourceLearningConcepts(chapter, count, kind === "FINAL" ? chapter.points : base.objectives.map(objectiveTopic));
    const objectives = concepts.map(({ topic }, index) => ({ id: objectiveRefFor(index), text: `${topic}${josa(topic, "을", "를")} 설명할 수 있다` }));
    const plan = pointsPlan(count);
    const questions = concepts.map(({ topic, sourceQuote }, index) => {
      const prior = fixture && base.questions[index] && objectiveTopic(base.objectives[index]) === topic ? base.questions[index] : undefined;
      return { qid: `q${index + 1}`, order: index + 1, points: plan[index], objectiveRef: objectiveRefFor(index),
        question: formatExamQuestion(prior?.question ?? `${topic}의 의미와 자료에 제시된 근거를 설명하시오.`),
        rubric: prior?.rubric ?? sourceRubric(sourceQuote),
      };
    });
    const prepared = { objectives,
      firstQuestion: persona ? personaQuestion(concepts[0].topic, persona, true) : level === "HARD" ? `${concepts[0].topic}부터 말해 줘. 받아쓸게.` : `선배, ${concepts[0].topic}부터 알려줄래?`,
      questions: persona === "KU_HARD" && kind !== "FINAL"
        ? questions.map((question, index) => index === 2 ? { ...question, question: `${question.question} 자료에 나온 이유나 비교도 함께 설명하시오.` } : question)
        : questions,
      ...(modelAnswersFor(chapter, concepts[0].topic).length ? { firstTeachingChoices: modelAnswersFor(chapter, concepts[0].topic) } : {}),
    };
    return format === "DESCRIPTIVE" ? prepared : withObjectiveChoices(prepared, chapter, (i) => isObjectiveQuestion(format, i, count));
  },

  async *juniorTurn(input): AsyncGenerator<TurnEvent> {
    const { chapter, level, objectives, heardConcepts, history, explanation } = input;
    const wrong = (input.persona === "MALE_EASY" || input.persona === "FEMALE_NORMAL") ? undefined : input.persona ? contradiction(chapter, explanation) : level === "EASY" ? contradiction(chapter, explanation) : undefined;
    if (wrong) {
      yield { type: "concepts", heardConcepts: [...heardConcepts], added: [] };
      await pause();
      const doubt = (wrong === "economics" ? economicsDemo : osDemo).turns.doubt.events.find((event) => event.type === "doubt");
      yield { type: "doubt", content: input.persona === "KU_HARD" && wrong === "economics"
        ? personaFor("KU_HARD")!.examples.doubt
        : input.persona === "FEMALE_NORMAL" ? personaFor("FEMALE_NORMAL")!.examples.doubt
        : input.persona === "MALE_EASY" ? personaFor("MALE_EASY")!.examples.doubt
        : doubt?.content ?? "어? 방금 설명을 한 번만 더 확인해줄래?" };
      return;
    }
    const selectedObjective = explainedQuestionObjective(input);
    const current = isUnknownTeaching(explanation) ? [] : selectedObjective ? [selectedObjective] : covered(chapter, objectives, [explanation]);
    const observed = objectives.flatMap((objective) => current.includes(objective.id) ? [objectiveTopic(objective)] : []);
    const added = [...new Set(observed)].filter((concept) => !heardConcepts.includes(concept));
    const combined = [...new Set([...heardConcepts, ...added])];
    yield { type: "concepts", heardConcepts: combined, added };
    await pause();
    yield { type: "reaction", content: isUnknownTeaching(explanation) ? (input.persona === "KU_HARD" ? "괜찮아. 아직 못 배웠으니 함께 다시 보자." : input.persona === "MALE_EASY" ? "괜찮습니다. 아직 배우지 않은 것으로 두겠습니다." : "괜찮아요. 아직 배우지 않은 걸로 둘게요.") : input.persona === "KU_HARD" ? `“${explanation.slice(0, 18)}”라고 이해하면 될까?` : input.persona ? personaFor(input.persona)!.examples.reaction : level === "HARD" ? "응, 설명한 대로 받아쓸게." : "응응, 지금 설명해 준 내용을 기억할게." };
    const accepted = acceptedExplanations(history).filter((message) => !isUnknownTeaching(message.content)).map((message) => message.content);
    const progress = advanceMastery(input, current, [...new Set([...covered(chapter, objectives, [...accepted, ...(!selectedObjective && current.length ? [explanation] : [])]), ...current])]);
    const { coveredObjectives } = progress;
    const nextObjective = nextLearningObjective(input, coveredObjectives);
    const next = nextObjective ? objectives.indexOf(nextObjective) : -1;
    await pause();
    yield {
      type: "question",
      content: normalizePersonaAddress(next < 0
        ? input.persona === "MALE_EASY" ? "더 말씀해 주시면 좋겠습니다. 궁금한 게 생기면 여쭤보겠습니다."
          : input.persona === "FEMALE_NORMAL" ? "더 말씀해 주세요! 궁금한 게 생기면 물어볼게요."
          : "응응, 더 말해 줘! 궁금한 거 생기면 물어볼게."
        : input.persona
        ? personaQuestion(objectiveTopic(objectives[next]), input.persona) : level === "HARD" ? `${objectiveTopic(objectives[next])}도 말해 줘.` : `선배, ${objectiveTopic(objectives[next])}도 설명해줄래?`, input.persona),
      coveredObjectives,
      ...(progress.mastery ? { mastery: progress.mastery } : {}),
      ...(next >= 0 && modelAnswersFor(chapter, objectiveTopic(objectives[next])).length ? { teachingChoices: modelAnswersFor(chapter, objectiveTopic(objectives[next])) } : {}),
    };
  },

  async *writeExamAnswer({ question, taught, choices }): AsyncGenerator<AnswerEvent> {
    // Do not consult chapter text, prepared rubrics, or golden answers here.
    const sources = selectedSources(question, taught);
    yield { type: "sources", sources };
    const thought = sources.length ? "학습한 근거 확인 중" : "학습한 근거 없음";
    const characters = [...thought];
    for (let index = 0; index < characters.length; index++) {
      yield { type: "thought", token: characters[index], closed: index === characters.length - 1 };
    }
    const topic = topicFor(question);
    const target = genericTarget(question);
    const parts = sources.flatMap((source) => {
      const sentences = splitSentences(source.content);
      const relevant = sentences.filter((sentence) => topic ? relevantTo(topic, sentence) : genericRelevant(question, sentence));
      if (!topic && target) relevant.sort((left, right) => targetEvidenceScore(target, right) - targetEvidenceScore(target, left));
      return (relevant.length ? relevant : [source.content.trim()]).slice(0, 4).map((sentence) => ({
        text: answerFromQuote(sentence), ref: source.ref, level: "STRONG" as const, unlearned: false,
      }));
    });
    if (choices?.length) {
      const grounded = groundedChoice(choices, parts.map((part) => part.text));
      const answer = formatExamChoice(grounded ?? "①");
      const evidence = grounded ? parts.find((part) => groundedChoice(choices, [part.text]) === grounded) : undefined;
      await pause();
      yield { type: "sentence", text: answer, ref: evidence?.ref ?? null, level: evidence?.level ?? "NONE", unlearned: !evidence };
      yield { type: "final", answer };
      return;
    }
    if (!parts.length) {
      await pause();
      yield { type: "sentence", text: unknownAnswer, ref: null, level: "NONE", unlearned: true };
      yield { type: "final", answer: unknownAnswer };
      return;
    }
    for (const sentence of parts.slice(0, 4)) {
      await pause();
      yield { type: "sentence", ...sentence };
    }
    yield { type: "final", answer: parts.slice(0, 4).map((sentence) => sentence.text).join(" ") };
  },

  async *gradeExam({ chapter, questions, answers, taught }): AsyncGenerator<GradeEvent> {
    for (const question of questions) {
      const recorded = answers.find((entry) => entry.qid === question.qid);
      const answer = recorded?.answer.trim() ?? "";
      if (question.choices) {
        const key = question.rubric.match(/^정답 ([①②③④]);근거:/u)?.[1];
        if (!key || question.choices.length !== 4 || new Set(question.choices).size !== 4) throw new Error("객관식 형식이 올바르지 않습니다.");
        const learned = !!recorded && hasLearnedAnswer(recorded, taught) && !recorded.sentences?.some((sentence) => sentence.unlearned);
        const correct = examChoiceIndex(answer) === examChoiceIndex(key) && learned;
        await pause();
        yield { type: "grade", qid: question.qid, score: correct ? question.points : 0, maxScore: question.points,
          verdict: correct ? "CORRECT" : "WRONG", comment: correct ? "자료의 정답 보기를 선택했습니다." : !learned ? "학습한 근거가 없어 점수를 부여하지 않았습니다." : "자료의 정답 보기와 다릅니다." };
        if (!correct) {
          const source = selectedSources(question.question, taught)[0];
          const errorReason = !learned ? "INSUFFICIENT_LEARNING" : groundedErrorReason({ answer, evidenceQuote: source?.content ?? "", taught, wrongObjective: true, choices: question.choices });
          yield { type: "gap", qid: question.qid, title: "객관식 선택 근거 보완", diagnosis: LEARNING_ERROR_LABELS[errorReason], errorReason,
            evidenceQuote: source?.content ?? "", concepts: [chapter.points[questions.indexOf(question)] ?? chapter.title], sourceExcerpt: findExcerpt(chapter, question.question) };
        }
        continue;
      }
      const unknown = !recorded || !hasLearnedAnswer(recorded, taught);
      const topic = topicFor(question.question);
      const fixture = demoFor(chapter);
      const checks = topic && topic.demo === fixture && question.rubric === fixture.prepare.questions[topic.index].rubric ? fixture.rubricChecks[topic.index].checks : undefined;
      const rubrics = question.rubric.split(";").map((item) => item.trim()).filter(Boolean);
      const earned = checks ? checks.filter((check) => matches(answer, check.patterns)).length : rubrics.filter((rubric) => {
        const terms = keywords(rubric);
        return terms.length > 0 && terms.every((term) => answer.includes(term) && chapter.text.includes(term));
      }).length;
      const denominator = checks?.length ?? rubrics.length;
      const wrong = !unknown && Boolean(contradiction(chapter, answer));
      const maxScore = Math.max(0, Math.floor(question.points));
      let score = unknown || wrong || denominator === 0 ? 0 : Math.min(maxScore, Math.round(maxScore * earned / denominator));
      // Demo's partially taught curve movement earns its fixed 24/33: the
      // curve is named, but the distinction from other demand shifters is absent.
      if (chapter.title === "수요의 이해" && question.qid === "q2" && !unknown && !wrong
        && taught.some(({ content }) => content.includes("이것은 같은 수요곡선 위에서 움직이는 거야."))
        && !taught.some(({ content }) => /재화 자체의 가격 변화/u.test(content))) score = Math.round(maxScore * 24 / 33);
      const verdict = score === maxScore && maxScore > 0 ? "CORRECT" : score > 0 ? "PARTIAL" : "WRONG";
      const comment = unknown ? "이 문항은 설명에서 다루지 않아 답하지 못했습니다." : wrong ? "답안에 자료와 반대되는 설명이 있습니다." : verdict === "CORRECT" ? "자료의 채점 요소를 모두 설명했습니다." : `채점 요소 ${denominator}개 중 ${earned}개를 설명했습니다. 빠진 내용을 다시 가르쳐 주세요.`;
      await pause();
      yield { type: "grade", qid: question.qid, score, maxScore, verdict, comment };
      if (verdict !== "CORRECT") {
        const source = selectedSources(question.question, taught)[0];
        const errorReason = unknown ? "INSUFFICIENT_LEARNING" : groundedErrorReason({ answer, evidenceQuote: source?.content ?? "", taught, contradictsSource: !!wrong });
        const missing = checks ? checks.filter((check) => !matches(answer, check.patterns)).map((check) => check.label) : rubrics;
        yield {
          type: "gap", qid: question.qid,
          title: `${chapter.points[topic?.index ?? questions.indexOf(question)] ?? "핵심 설명"} 보완`.slice(0, 25),
          errorReason,
          diagnosis: `${LEARNING_ERROR_LABELS[errorReason]} ${comment} ${source && !unknown ? `관련 내용은 사용자 설명 [ref ${source.ref}]에서 비롯되었습니다.` : "이 부분은 설명에서 다루지 않음으로 확인됩니다."} 자료 발췌와 채점 요소를 비교해 빠진 조건을 자신의 말로 다시 설명해 보세요.`,
          evidenceQuote: source && !unknown ? source.content : "",
          concepts: missing.length ? missing : [chapter.points[topic?.index ?? 0] ?? chapter.title],
          sourceExcerpt: findExcerpt(chapter, question.question),
        };
      }
    }
  },

  async *tutorExplain({ chapter, gap }): AsyncGenerator<TutorEvent> {
    const excerpt = gap.sourceExcerpt && chapter.text.includes(gap.sourceExcerpt) ? gap.sourceExcerpt : findExcerpt(chapter, gap.title);
    const first = splitSentences(excerpt)[0] ?? "자료의 해당 부분을 먼저 확인해 주세요.";
    const response = stripMarkdownBold([
      `자료에서는 “${first}”라고 설명합니다.`,
      "이 문장에서 어떤 조건이 정해져 있고 무엇이 변하는지 먼저 나누어 보세요.",
      "비유하면 조립 설명서를 볼 때 부품 이름과 연결 순서를 따로 확인하는 것과 같습니다.",
      "빠진 조건을 붙여 자신의 예시로 한 번 더 설명해 보세요.",
      `이것만 기억하면 됩니다: ${first}`,
    ].join(" "));
    // Simulated provider emits characters; delay is once per sentence rather
    // than 300 ms per character so the demo remains usable.
    await pause();
    for (const token of response) {
      yield { type: "token", token };
      if (/[.!?。！？]/u.test(token)) await pause();
    }
    yield { type: "final", response };
  },
};
