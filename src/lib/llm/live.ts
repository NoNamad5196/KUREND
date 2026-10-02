import { answerFromQuote, completeTeachingQuote, evidenceSimilarity, groundedChoice, groundedErrorReason, groundedDiagnosis } from "./exam-grounding";
import { MODEL_ANSWERS_PROMPT, MODEL_KEYWORDS_PROMPT } from "./prompts/model-answers";
import type { TeachingHintMode } from "@/lib/shared/teaching-hints";
import type { TeachingChoiceDto } from "@/contracts/types";
import type { Llm, TaughtMsg } from "./types";
import { completeJSON, streamText } from "./transport";
import {
  analyzeTurnSchema, chaptersSchema, examAnswerSchema,
  gradeExamSchema, prepareSessionSchemaFor, respondTurnSchema, teacherNoteSchema, objectiveGapSchema,
} from "./schemas";
import {
  compactChapter, compactText, paragraphizeSources, rubricElements,
  uniqueStrings, UNLEARNED_ANSWER, hasLearnedAnswer,
} from "./text";
import { GENERATE_CHAPTERS_PROMPT } from "./prompts/generate-chapters";
import { PREPARE_SESSION_PROMPT, OBJECTIVE_EXAM_PROMPT, KU_EXAM_PROMPT, FEMALE_EXAM_PROMPT, examPlanPrompt } from "./prompts/prepare-session";
import { isObjectiveQuestion, pointsPlan, PRACTICE_QUESTION_COUNT, questionCountFor } from "@/contracts/game";
import { formatExamChoice, examChoiceIndex } from "@/lib/shared/exam-format";
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import { ANALYZE_TURN_PROMPT } from "./prompts/analyze-turn";
import { RESPOND_TURN_PROMPT } from "./prompts/respond-turn";
import { WRITE_EXAM_ANSWER_PROMPT, OBJECTIVE_ANSWER_PROMPT } from "./prompts/write-exam-answer";
import { GRADE_EXAM_PROMPT, OBJECTIVE_GAP_PROMPT } from "./prompts/grade-exam";
import { acceptedExplanations, nextObjectiveQuestion, nextLearningObjective } from "./turn-state";
import { createTutorExplain } from "./tutor";
import { TEACHER_NOTE_PROMPT } from "./prompts/teacher-note";
import { personaFor, normalizePersonaAddress, personaQuestion } from "./personas";
import { objectiveTopic, isUnknownTeaching, explainedQuestionObjective, matchQuestionObjective, modelAnswersFor, modelAnswersSchema, modelAnswerChoices, modelKeywordsFor, modelKeywordsSchema, modelKeywordChoices } from "./teaching-choices";
import { advanceMastery } from "./mastery";

function taughtMessages(messages: TaughtMsg[]): TaughtMsg[] {
  const refs = new Set<number>();
  return messages.map(({ ref, content }) => {
    if (!Number.isInteger(ref) || ref < 1 || refs.has(ref)) throw new Error("사용자 설명 참조 번호가 올바르지 않습니다.");
    refs.add(ref);
    return { ref, content };
  }).filter(({ content }) => content.trim().length > 0 && !isUnknownTeaching(content));
}

/* ── 시험 답안 안전망: 모델 JSON 이 두 번 검증에 실패해도 시험이 멈추지 않도록, 가르친 문장만으로 결정적 답안을 만든다 ── */
const CHOICE_MARKS = ["①", "②", "③", "④"] as const;
function bigrams(text: string): Set<string> {
  const plain = text.replace(/[\s.,!?“”"'()·~\-:;→⇒]/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < plain.length - 1; i += 1) out.add(plain.slice(i, i + 2));
  return out;
}
function overlap(a: string, b: string): number {
  const x = bigrams(a); const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let hit = 0;
  for (const g of x) if (y.has(g)) hit += 1;
  return hit / Math.min(x.size, y.size);
}
function taughtSentences(messages: TaughtMsg[]): { ref: number; quote: string }[] {
  return messages.flatMap(({ ref, content }) => content.split(/(?<=[.!?。])\s+|\n+/u).map((quote) => quote.trim()).filter((quote) => quote.length >= 6).map((quote) => ({ ref, quote })));
}
/**
 * 졸업시험처럼 가르친 설명이 많으면(10여 개·1만 자 이상) 모델이 인용을 못 찾고 "못 배움"으로 답하기 쉽다.
 * 질문·보기와 어휘가 겹치는 설명 순으로 추려 넘긴다(ref 는 그대로이므로 인용 검증과 근거 표시는 바뀌지 않는다).
 */
const RELEVANT_TAUGHT_LIMIT = 6;
function relevantTaught(question: string, messages: TaughtMsg[], choices?: string[]): TaughtMsg[] {
  if (messages.length <= RELEVANT_TAUGHT_LIMIT) return messages;
  const targets = [question, ...(choices ?? [])];
  const scored = messages.map((message) => ({ message, score: Math.max(...taughtSentences([message])
    .map((item) => Math.max(...targets.map((target) => overlap(item.quote, target))))) }));
  const kept = new Set(scored.sort((a, b) => b.score - a.score).slice(0, RELEVANT_TAUGHT_LIMIT).map(({ message }) => message.ref));
  return messages.filter((message) => kept.has(message.ref));
}
/** 질문·보기와 어휘가 겹치는 가르친 문장(원문 그대로)을 미리 골라 준다. 모델은 이 중에서 답의 근거를 복사하면 인용 검증을 통과한다. */
function taughtHints(question: string, messages: TaughtMsg[], choices?: string[]): { ref: number; quote: string }[] {
  const targets = [question, ...(choices ?? []).map((choice) => choice.replace(/^[①②③④]\s*/u, ""))];
  return taughtSentences(messages)
    .map((item) => ({ ...item, score: Math.max(...targets.map((target) => overlap(item.quote, target))) }))
    .filter((item) => item.score >= 0.12)
    .sort((a, b) => b.score - a.score).slice(0, 8)
    .map(({ ref, quote }) => ({ ref, quote }));
}
/**
 * 출제된 보기들이 한두 단어만 다른 최소 대립쌍이면 어휘 유사도만으로는 하나를 못 가린다(groundedChoice 가 null).
 * 그때는 검증된 인용(선배 설명 원문)이 모델이 고른 보기와 충분히 겹치고 다른 보기보다 뒤지지 않을 때만 모델의 선택을 받아들인다.
 * 인용과 무관한 보기를 고른 경우(자기 지식으로 찍기)는 여전히 근거 없음이다.
 */
function supportedModelChoice(choices: string[], quotes: string[], choice?: string | null): string | null {
  if (!choice || !quotes.length) return null;
  const scores = choices.map((text) => Math.max(...quotes.map((quote) => evidenceSimilarity(quote, text))));
  const index = choices.findIndex((text) => text.startsWith(choice));
  if (index < 0 || scores[index] < 0.25 || scores[index] < Math.max(...scores) - 0.05) return null;
  return choice;
}
/**
 * 질문이 묻는 개념(첫 조사 앞의 머리 어구: "나선형 개발 모형의 단계 순서로…" → 나선형 개발 모형, "대기 상태에 대하여…" → 대기 상태)의
 * 낱말이 모두 그 설명에 등장해야 "그 개념을 배운 설명"으로 본다. 이름만 비슷한 다른 개념(준비 상태 ↔ 대기 상태)의 설명은 근거가 아니다.
 */
const QUESTION_BOILERPLATE = /^(?:설명|옳은|옳지|틀린|않은|것|고르시오|관한|관하여|대한|대하여|방식|내용|다음|가장|적절|경우|무엇|어떤|하시오|서술|비교|제시|이유|특징|의미|차이|설명하시오|쓰시오|기술|중|및|또는|그리고|있는|없는|대해|따라|관련|해당|이용|사용|통해|위한|위해)$/u;
function questionMentioned(question: string, content: string): boolean {
  const head = question.match(/^(.+?)(?:의|에서|에게|에|과|와|은|는|을|를|으로|로)\s/u)?.[1] ?? question;
  const terms = (head.match(/[가-힣A-Za-z0-9]{2,}/gu) ?? [])
    .map((term) => term.replace(/(?:으로|에서|부터|까지|의|을|를|은|는|이|가|과|와|로|에|도)$/u, ""))
    .filter((term) => term.length >= 2 && !QUESTION_BOILERPLATE.test(term));
  return terms.length > 0 && terms.every((term) => content.includes(term));
}
function fallbackExamAnswer(question: string, messages: TaughtMsg[], choices?: string[]) {
  const ranked = taughtSentences(messages)
    .map((item) => ({ ...item, score: overlap(item.quote, question) + (choices ? Math.max(...choices.map((choice) => overlap(item.quote, choice))) : 0) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked.filter((item) => item.score >= 0.18).slice(0, 2);
  const basis = best.map((item) => item.quote).join(" ") || messages.map((m) => m.content).join(" ");
  const choice = choices?.length === 4
    ? CHOICE_MARKS[choices.map((c) => overlap(basis, c.replace(/^[①②③④]\s*/u, ""))).reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0)]
    : undefined;
  if (!best.length) {
    return { thought: "들은 것 같긴 한데 잘 모르겠어.", choice, unlearned: true, sentences: [{ quote: null, ref: null, level: "NONE" as const }] };
  }
  return { thought: "선배가 해 준 말을 떠올려 볼게.", choice, unlearned: false, sentences: best.map(({ ref, quote }) => ({ quote, ref, level: "FAINT" as const })) };
}

/* ── 출력 문체 ── */
/** 반응은 호칭 없이 감탄으로: 앞뒤의 "선배님," "…, 선배님!"을 떼고 마크다운을 지운다 */
/** 답안 문장이 시험 답안 문체(평서형 ~다/~음)로 끝나는지 */
const isAnswerStyle = (text: string) => /(다|음|함|됨|임)\s*[.。]?\s*$/u.test(text.trim());
/** 답안 문장의 바이그램 중 허용 본문(근거 + 관련 자료 문장)에도 있는 비율 — 새 사실이 끼어들면 낮아진다 */
function precision(answer: string, allowed: string): number {
  const a = bigrams(answer); const q = bigrams(allowed);
  if (!a.size) return 0;
  let hit = 0;
  for (const g of a) if (q.has(g)) hit += 1;
  return hit / a.size;
}
/** 근거 인용의 바이그램 중 답안에 남아 있는 비율 — 선배의 말을 빼거나 바꾸면(틀린 설명을 자료로 고치는 것 포함) 낮아진다 */
function recall(answer: string, quote: string): number {
  const a = bigrams(answer); const q = bigrams(quote);
  if (!q.size) return 1;
  let hit = 0;
  for (const g of q) if (a.has(g)) hit += 1;
  return hit / q.size;
}
/**
 * 답안이 빌려 쓸 수 있는 자료 문장: 선배의 근거(quote)와 같은 개념을 말하는 자료 문장만(겹침 상위 3개).
 * 자료 전체를 허용하면 선배가 설명하지 않은 사실까지 답안에 들어오므로, 근거와 겹치는 문장으로 제한한다.
 */
function relatedSourceSentences(quote: string, chapter?: Parameters<typeof compactChapter>[0]): string[] {
  if (!chapter) return [];
  return chapter.text.split(/(?<=[.!?。])\s+|\n+/u).map((s) => stripMarkdownBold(s).trim()).filter((s) => s.length >= 8)
    .map((sentence) => ({ sentence, score: overlap(quote, sentence) }))
    .filter((item) => item.score >= 0.2)
    .sort((a, b) => b.score - a.score).slice(0, 3).map((item) => item.sentence);
}
/**
 * 시험 답안 문장: 모델이 다듬은 답안체 문장을 쓰되 "선배의 근거(quote)에 자료의 용어를 더한 것"까지만 허용한다.
 *  - 선배가 말한 내용은 그대로 남아야 한다(recall ≥ 0.85) → 틀린 설명을 자료로 고치거나 일부를 빼면 근거 원문으로 되돌린다.
 *  - 새로 들어온 어구는 근거와 같은 개념을 말하는 자료 문장에 있는 것이어야 하고(precision ≥ 0.75), 길이는 근거의 1.25배+15자까지.
 *  - 부정·수치는 근거와 같아야 한다. 대화체·호칭이면 거절.
 * 거절되면 근거 원문을 답안체로 다듬어 쓴다 — 어떤 경우에도 선배가 설명한 것보다 자세해질 수 없다.
 */
/** 뜻을 뒤집거나 깎는 작은 편집(부정 추가·삭제, 수치 변경)은 어구 겹침으로는 잡히지 않으므로 따로 막는다 */
const NEGATION_MARKERS = ["않", "못 ", "못하", "없", "아니", "금지", "불가", "반대"];
function keepsMeaningMarkers(answer: string, quote: string): boolean {
  for (const marker of NEGATION_MARKERS) if (quote.includes(marker) !== answer.includes(marker)) return false;
  const numbers = (text: string) => new Set(text.match(/\d+(?:[.,]\d+)?/gu) ?? []);
  const quoteNumbers = numbers(quote); const answerNumbers = numbers(answer);
  if ([...quoteNumbers].some((n) => !answerNumbers.has(n)) || [...answerNumbers].some((n) => !quoteNumbers.has(n))) return false;
  return true;
}
function answerSentence(quote: string, answer?: string | null, chapter?: Parameters<typeof compactChapter>[0]): string {
  const candidate = stripMarkdownBold(answer ?? "").replace(/\s+/g, " ").trim();
  const allowed = [quote, ...relatedSourceSentences(quote, chapter)].join(" ");
  const usable = candidate.length > 0 && candidate.length <= quote.length * 1.25 + 15
    && !/선배|배웠|알려주|가르쳐 주/u.test(candidate) && isAnswerStyle(candidate)
    && precision(candidate, allowed) >= 0.75 && recall(candidate, quote) >= 0.85 && keepsMeaningMarkers(candidate, quote);
  // 모델 문장이든 근거 원문이든 답안지 문체(호칭·대화체 제거, ~다.)로 정리한다(answerFromQuote = plainExamAnswer).
  return answerFromQuote(usable ? candidate : quote);
}

export type LiveProviderCalls = {
  completeJSON: typeof completeJSON;
  streamText: typeof streamText;
};

export function createLiveLlm(calls: LiveProviderCalls = { completeJSON, streamText }): Llm {
  /**
   * 후배의 질문마다 채팅 위에 보여 줄 모범답안 2개. 자료(source)의 사실만으로 선배 말투로 쓰게 하고, 서버가 자료 근거·호칭·마크다운을 검증한다.
   * 모델이 실패하면 자료 문장 그대로(modelAnswersFor). rubric·시험 정답은 넘기지 않는다.
   */
  async function authorModelAnswers(chapter: Parameters<Llm["prepareSession"]>[0]["chapter"], topic: string,
    extra: { objective?: string; question?: string; previous?: string[]; mode?: TeachingHintMode } = {}): Promise<TeachingChoiceDto[]> {
    if (extra.mode === "keywords") {
      // 실제 계정: 답안 대신 자료 용어 3개. 모델이 실패하면 주제 문장의 빈출 용어.
      const picked = await calls.completeJSON(MODEL_KEYWORDS_PROMPT, JSON.stringify({
        topic, objective: extra.objective ?? "", question: extra.question ?? "", source: compactChapter(chapter),
      }), modelKeywordsSchema(chapter, topic), { temperature: 0.2, maxOutputTokens: 200, timeoutMs: 10_000, stage: "model-keywords" }).catch(() => null);
      return picked ? modelKeywordChoices(picked.keywords.map((text) => stripMarkdownBold(text))) : modelKeywordsFor(chapter, topic);
    }
    const authored = await calls.completeJSON(MODEL_ANSWERS_PROMPT, JSON.stringify({
      topic, objective: extra.objective ?? "", question: extra.question ?? "", source: compactChapter(chapter), previous: extra.previous ?? [],
    }), modelAnswersSchema(chapter, topic), { temperature: 0.3, maxOutputTokens: 600, timeoutMs: 12_000, stage: "model-answers" }).catch(() => null);
    return authored ? modelAnswerChoices(authored.answers.map((text) => stripMarkdownBold(text))) : modelAnswersFor(chapter, topic);
  }
  return {
    generateTeachingChoices: ({ chapter, topic, objective, question, previous, mode }) => authorModelAnswers(chapter, topic, { objective, question, previous, mode }),
    async generateTeacherNote({ chapter }) {
      const note = await calls.completeJSON(TEACHER_NOTE_PROMPT, JSON.stringify({ chapter: compactChapter(chapter) }), teacherNoteSchema,
        { temperature: 0.2, maxOutputTokens: 1_200 });
      return { mustTeach: note.mustTeach.map((text) => stripMarkdownBold(text)), keyTakeaways: note.keyTakeaways.map((text) => stripMarkdownBold(text)),
        confusing: note.confusing.map((text) => stripMarkdownBold(text)), likelyQuestions: note.likelyQuestions.map((text) => stripMarkdownBold(text)) };
    },
    async generateChapters({ sources }) {
      const prepared = paragraphizeSources(sources);
      const response = await calls.completeJSON(GENERATE_CHAPTERS_PROMPT, JSON.stringify({
        sources: prepared.sources.map(({ sourceId, truncated, paragraphs }) => ({
          sourceId, truncated, omissionNotice: truncated ? "…이하 생략" : "",
          paragraphs: paragraphs.map(({ index, text }) => ({ index, label: `[P${index}]`, text, length: text.length })),
        })),
        minChapters: prepared.minChapters, maxChapters: prepared.maxChapters,
      }), chaptersSchema(prepared.paragraphs, prepared.minChapters), { temperature: 0.2 });
      return {
        title: response.title,
        chapters: response.chapters.map((chapter) => {
          const first = prepared.paragraphs[chapter.startPara];
          const last = prepared.paragraphs[chapter.endPara];
          return {
            title: chapter.title, points: chapter.points, sourceId: first.sourceId,
            startOffset: first.startOffset, endOffset: last.endOffset,
          };
        }),
      };
    },

    async prepareSession({ chapter, level, persona, examFormat, questionCount, kind, hintMode }) {
      const spec = personaFor(persona);
      const format = examFormat ?? spec?.examFormat ?? "DESCRIPTIVE";
      const count = questionCount ?? (persona ? questionCountFor(persona) : PRACTICE_QUESTION_COUNT);
      const plan = pointsPlan(count);
      const objectiveIndexes = plan.flatMap((_, i) => isObjectiveQuestion(format, i, count) ? [i] : []);
      const instruction = format === "OBJECTIVE" ? OBJECTIVE_EXAM_PROMPT : persona === "KU_HARD" ? KU_EXAM_PROMPT : persona === "FEMALE_NORMAL" ? FEMALE_EXAM_PROMPT : "";
      const prepared = await calls.completeJSON(`${PREPARE_SESSION_PROMPT}\n${instruction}\n${examPlanPrompt(count, plan, objectiveIndexes, kind)}`, JSON.stringify({
        chapter: compactChapter(chapter), level, examFormat: format, questionCount: count, kind: kind ?? "CHAPTER",
      }), prepareSessionSchemaFor(count, objectiveIndexes, compactChapter(chapter).text), {
        temperature: 0.2, stage: "prepare-session",
        // 목표마다 자료 원문 인용(sourceQuote)이 붙으므로 넉넉히(졸업시험 10문항 ≈ 1만 토큰). 모자라면 JSON 이 잘려 502 가 난다.
        maxOutputTokens: Math.max(2_000, 1_000 + count * (objectiveIndexes.length ? 900 : 700)),
        timeoutMs: Math.max(20_000, 10_000 + count * 5_000),
      });
      const topic = objectiveTopic(prepared.objectives[0]);
      const firstQuestion = persona ? personaQuestion(topic, persona, true) : level === "HARD" ? `${topic}부터 말해 줘. 받아쓸게.` : `선배, ${topic}부터 알려줄래?`;
      const firstTeachingChoices = await authorModelAnswers(chapter, topic, { objective: prepared.objectives[0].text, question: firstQuestion, mode: hintMode });
      return { ...prepared, objectives: prepared.objectives.map(({ id, text }) => ({ id, text })), firstQuestion,
        ...(firstTeachingChoices.length ? { firstTeachingChoices } : {}),
      };
    },

    async *juniorTurn(input) {
      // Keep cumulative accepted teaching, not a tail of mixed USER/JUNIOR
      // messages: a tail can forget an already-completed objective.
      const currentRef = input.history.length + 1;
      const taught = [...acceptedExplanations(input.history), { ref: currentRef, content: input.explanation }];
      const analysis = await calls.completeJSON(ANALYZE_TURN_PROMPT, JSON.stringify({
        chapter: compactChapter(input.chapter), objectives: input.objectives,
        taught, currentRef, explanation: input.explanation,
        ...(input.persona ? { character: input.persona, persona: {
          voice: personaFor(input.persona)?.voice, comprehension: personaFor(input.persona)?.comprehension,
          memory: personaFor(input.persona)?.memory, misunderstanding: personaFor(input.persona)?.misunderstanding,
          doubtFrequency: personaFor(input.persona)?.doubtFrequency,
        } } : {}),
      }), analyzeTurnSchema(input.explanation, input.objectives.map((objective) => objective.id), taught),
      { temperature: 0, maxOutputTokens: 1_000, timeoutMs: 10_000, stage: "analyze-turn" });
      const unknown = isUnknownTeaching(input.explanation);
      const selectedObjective = explainedQuestionObjective(input);
      const acceptedWrongObjectives = input.persona === "MALE_EASY" || input.persona === "FEMALE_NORMAL"
        ? input.objectives.filter((objective) => analysis.concepts.some(({ name, quote }) =>
          objectiveTopic(objective) === name && analysis.contradictions.some(({ claim }) => claim.includes(quote) || quote.includes(claim))))
          .map(({ id }) => id) : [];
      const previousConcepts = uniqueStrings(input.heardConcepts);
      const needsDoubt = analysis.contradictions.length > 0 && (input.persona === "KU_HARD" || (!input.persona && input.level === "EASY"));
      if (needsDoubt) {
        // Only the learner's own words can enter a doubt. Internal "why" and source text never do.
        const claim = compactText(analysis.contradictions[0].claim, 100);
        yield { type: "concepts", heardConcepts: previousConcepts, added: [] };
        yield { type: "doubt", content: input.persona === "KU_HARD"
          ? `잠깐만 선배. “${claim}”라는 건 내가 이해한 게 맞아?`
          : input.persona === "FEMALE_NORMAL" ? `“${claim}”라면 왜 그런가요?`
          : `어? “${claim}”라는 설명이 조금 헷갈려. 한 번만 더 설명해줄래?` };
        return;
      }
      // Labels can be Korean paraphrases; their actual evidence must be a
      // validated verbatim quote of this explanation.
      const mentionedConcepts = unknown ? [] : uniqueStrings([
        ...analysis.concepts.map(({ name }) => stripMarkdownBold(name)),
        ...(selectedObjective ? [objectiveTopic(input.objectives.find((item) => item.id === selectedObjective)!)] : []),
      ]);
      const added = mentionedConcepts.filter((concept) => !previousConcepts.includes(concept));
      const heardConcepts = uniqueStrings([...previousConcepts, ...added]);
      const coverage = analysis.coverage.filter((item) => !unknown || item.evidence.some((evidence) => evidence.ref !== currentRef));
      const currentObjectives = unknown ? [] : uniqueStrings([
        ...coverage.filter((item) => item.evidence.some((evidence) => evidence.ref === currentRef)).map(({ id }) => id),
        ...(selectedObjective ? [selectedObjective] : []), ...acceptedWrongObjectives,
      ]);
      const progress = advanceMastery(input, currentObjectives, uniqueStrings([...coverage.map(({ id }) => id), ...(selectedObjective ? [selectedObjective] : []), ...acceptedWrongObjectives]));
      const { coveredObjectives } = progress;
      yield { type: "concepts", heardConcepts, added };
      // Keep persona progress and question selection deterministic, but let
      // provider failures reach the saved-turn retry flow instead of faking a reply.
      const nextObjective = nextLearningObjective(input, coveredObjectives);
      const fallbackQuestion = input.persona && nextObjective
        ? personaQuestion(objectiveTopic(nextObjective), input.persona)
        : normalizePersonaAddress(nextObjectiveQuestion(input, coveredObjectives), input.persona);
      const persona = personaFor(input.persona);
      const respondCall = calls.completeJSON(`${RESPOND_TURN_PROMPT}${persona ? `\n현재 후배: ${persona.name}. 말투: ${persona.voice}` : ""}`, JSON.stringify({
          level: input.level,
          persona: input.persona ? { id: input.persona, ...persona } : null,
          history: input.history.slice(-6).map(({ role, stage, content }) => ({ role, stage, content: compactText(content, 240) })),
          explanation: input.explanation,
          analysis: { heardConcepts, contradictionClaims: [], coveredObjectives },
          objectives: input.objectives.map(({ id, text }) => ({ id, text })),
          nextQuestionHint: fallbackQuestion,
      }), respondTurnSchema, { temperature: 0.7, maxOutputTokens: 400, timeoutMs: 12_000, stage: "respond-turn" });
      // 모범답안은 후배 반응 생성과 병렬로 쓴다. '모르겠다'면 같은 주제이므로 직전 선택지를 그대로 둔다.
      const lastQuestion = [...input.history].reverse().find((message) => message.role === "JUNIOR" && message.stage === "QUESTION");
      const previousChoices = lastQuestion?.teachingChoices ?? [];
      const sameTopicAgain = Boolean(nextObjective && lastQuestion && matchQuestionObjective(input.objectives, lastQuestion.content)?.id === nextObjective.id);
      const choicesCall: Promise<TeachingChoiceDto[]> = !nextObjective ? Promise.resolve([])
        : unknown && previousChoices.length ? Promise.resolve(previousChoices)
        : authorModelAnswers(input.chapter, objectiveTopic(nextObjective), { objective: nextObjective.text, question: fallbackQuestion,
          previous: sameTopicAgain ? previousChoices.map((choice) => choice.text) : [], mode: input.hintMode });
      const [responded, teachingChoices] = await Promise.all([respondCall, choicesCall]);
      const reactions = unknown ? [input.persona === "KU_HARD" ? "괜찮아. 아직 못 배웠으니 함께 다시 보자." : input.persona === "MALE_EASY" ? "괜찮습니다. 아직 배우지 않은 것으로 두겠습니다." : "괜찮아요. 아직 배우지 않은 걸로 둘게요."] : (analysis.contradictions.length > 0 && (input.persona === "MALE_EASY" || input.persona === "FEMALE_NORMAL")
        ? [personaFor(input.persona)!.examples.reaction] : responded.reactions).map((reaction) => (input.persona === "MALE_EASY" || input.persona === "FEMALE_NORMAL")
          && /믿|신뢰|말씀하셨으니|틀렸|잘못|아니에요|아닙니다|정답|자료에는|사실은/u.test(reaction) ? personaFor(input.persona)!.examples.reaction : reaction);
      let question = unknown ? fallbackQuestion : responded.question;
      if (input.persona === "KU_HARD" && nextObjective && currentObjectives.includes(nextObjective.id)) question = fallbackQuestion;
      if (input.persona === "FEMALE_NORMAL" && nextObjective && !/왜|의미|이유/u.test(question)) question = fallbackQuestion;
      for (const content of reactions) {
        const cleaned = stripMarkdownBold(content);
        const wrongRegister = input.persona === "MALE_EASY" ? /(?:해요|어요|할게요|같아요)[.!?]*$/u.test(cleaned)
          : input.persona === "FEMALE_NORMAL" && /(?:습니다|입니다)[.!?]*$/u.test(cleaned);
        yield { type: "reaction", content: normalizePersonaAddress(wrongRegister ? personaFor(input.persona)!.examples.reaction : cleaned, input.persona, { kind: "reaction" }).slice(0, 40) };
      }
      yield { type: "question", coveredObjectives, content: stripMarkdownBold(normalizePersonaAddress(
        (input.persona === "MALE_EASY" || input.persona === "FEMALE_NORMAL") && nextObjective ? fallbackQuestion : question, input.persona)),
        ...(progress.mastery ? { mastery: progress.mastery } : {}),
        ...(teachingChoices.length ? { teachingChoices } : {}),
      };
    },

    async *writeExamAnswer({ question, taught, heardConcepts, choices, chapter }) {
      const messages = taughtMessages(taught);
      const shown = relevantTaught(question, messages, choices);
      const response = messages.length ? await calls.completeJSON(`${WRITE_EXAM_ANSWER_PROMPT}${choices ? OBJECTIVE_ANSWER_PROMPT : ""}`, JSON.stringify({
        // Knowledge boundary: taught decides what the junior knows. The chapter is only a wording reference
        // (never the rubric or answer key), and the server rejects answers that grow beyond the cited basis.
        question, taught: shown, taughtHints: taughtHints(question, shown, choices), heardConcepts: uniqueStrings(heardConcepts), choices,
        // 자료(chapter)는 용어·표현 참고용일 뿐 지식의 범위는 taught 가 정한다. rubric·정답은 절대 넘기지 않는다.
        ...(chapter ? { chapter: compactChapter(chapter) } : {}),
      }), examAnswerSchema(shown, choices), { temperature: 0, maxOutputTokens: 1_200 })
        .catch(() => fallbackExamAnswer(question, messages, choices)) : {
        thought: "아직 선배에게 들은 설명이 없어.",
        sentences: [{ quote: null, ref: null, level: "NONE" as const }],
        unlearned: true, choice: choices ? "①" : undefined,
      };
      let groundedSentences = response.sentences.map((sentence) => {
        const source = messages.find((message) => message.ref === sentence.ref);
        return { ...sentence, quote: sentence.quote && source ? completeTeachingQuote(sentence.quote, source.content) : sentence.quote };
      });
      const quotes = groundedSentences.flatMap((sentence) => sentence.quote ? [sentence.quote] : []);
      let grounded = choices ? groundedChoice(choices, quotes) ?? supportedModelChoice(choices, quotes, response.choice) : null;
      let unlearned = response.unlearned;
      // 모델이 근거를 못 찾아 "못 배움"으로 답했어도, 질문·보기와 겹치는 가르친 문장이 보기 하나를 분명히 가리키면
      // 그 문장을 FAINT 근거로 쓴다. 어느 보기인지 가릴 수 없으면(groundedChoice null) 추측하지 않고 그대로 둔다.
      // 다른 개념을 설명한 문장이 보기와 우연히 겹치는 경우를 막기 위해, 질문의 개념어가 등장하는 설명(ref)만 복구 근거가 된다.
      if (choices?.length && !grounded && messages.length) {
        const rescue = fallbackExamAnswer(question, messages.filter((message) => questionMentioned(question, message.content)), choices);
        const rescued = rescue.unlearned ? null : groundedChoice(choices, rescue.sentences.flatMap((sentence) => sentence.quote ? [sentence.quote] : []));
        if (rescued) { groundedSentences = rescue.sentences; grounded = rescued; unlearned = false; }
      }
      const citedRefs = new Set(groundedSentences.map((sentence) => sentence.ref));
      yield { type: "sources", sources: messages.filter((message) => citedRefs.has(message.ref)) };
      for (const token of "학습한 근거 확인 중") yield { type: "thought", token, closed: false };
      yield { type: "thought", token: "", closed: true };
      if (choices?.length) {
        const evidence = grounded ? groundedSentences.find((sentence) => sentence.ref !== null && sentence.quote !== null
          && (groundedChoice(choices, [sentence.quote]) ?? supportedModelChoice(choices, [sentence.quote], grounded)) === grounded) : undefined;
        const answer = formatExamChoice(grounded ?? response.choice ?? "①");
        yield { type: "sentence", text: answer, ref: evidence?.ref ?? null,
          level: evidence?.level ?? "NONE", unlearned: unlearned || !evidence };
        yield { type: "final", answer };
        return;
      }
      const sentences = groundedSentences.map((sentence) => ({ ...sentence,
        // 서술형: 선배 근거 + 그 근거에 해당하는 자료 문장 안에서 모델이 다듬은 답안을 쓰고, 범위를 넘으면 근거 원문
        text: sentence.quote === null ? UNLEARNED_ANSWER : answerSentence(sentence.quote, "answer" in sentence ? sentence.answer : null, chapter),
      }));
      for (const sentence of sentences) {
        yield { type: "sentence", text: sentence.text, ref: sentence.ref,
          level: sentence.ref === null ? "NONE" : sentence.level,
          unlearned: unlearned || sentence.ref === null };
      }
      yield { type: "final", answer: sentences.map((sentence) => sentence.text).join(" ") };
    },

    async *gradeExam({ chapter, questions, answers, taught }) {
      const messages = taughtMessages(taught);
      if (new Set(questions.map(({ qid }) => qid)).size !== questions.length || new Set(answers.map(({ qid }) => qid)).size !== answers.length) {
        throw new Error("문항 또는 답안 번호가 중복되었습니다.");
      }
      const boundedChapter = compactChapter(chapter);
      for (const question of questions) {
        const elements = rubricElements(question.rubric);
        if (!elements.length || !Number.isInteger(question.points) || question.points < 1 || question.points > 100) {
          throw new Error("문항 배점 또는 채점 기준이 올바르지 않습니다.");
        }
        const answer = answers.find(({ qid }) => qid === question.qid);
        if (!answer) throw new Error("모든 문항의 답안을 작성한 뒤 채점할 수 있습니다.");
        if (question.choices) {
          if (question.choices.length !== 4 || new Set(question.choices).size !== 4) throw new Error("객관식 보기가 올바르지 않습니다.");
          const key = question.rubric.match(/^정답 ([①②③④]);근거:/u)?.[1];
          if (!key || !question.choices.some((choice) => choice.startsWith(key))) throw new Error("객관식 정답 번호가 올바르지 않습니다.");
          const selected = examChoiceIndex(answer.answer);
          const guessed = !hasLearnedAnswer(answer, messages) || answer.sentences?.some((sentence) => sentence.unlearned) === true;
          const correct = selected === examChoiceIndex(key) && !guessed;
          yield { type: "grade", qid: question.qid, score: correct ? question.points : 0,
            maxScore: question.points, verdict: correct ? "CORRECT" : "WRONG",
            comment: correct ? "선배에게 배운 내용과 일치하는 보기를 골랐습니다."
              : guessed ? "배운 근거 없이 보기를 찍었습니다. 이 부분은 아직 가르치지 않았어요." : "선택한 보기가 자료의 정답과 다릅니다." };
          if (!correct) {
            const { gap } = await calls.completeJSON(OBJECTIVE_GAP_PROMPT, JSON.stringify({
              chapter: boundedChapter, question, answer: answer.answer, taught: messages,
            }), objectiveGapSchema(chapter.text, messages), { temperature: 0, maxOutputTokens: 900 });
            const errorReason = guessed ? "INSUFFICIENT_LEARNING" : groundedErrorReason({ proposed: gap.errorReason, answer: answer.answer, evidenceQuote: gap.evidenceQuote, taught: messages, wrongObjective: true, choices: question.choices });
            yield { type: "gap", qid: question.qid, ...gap, errorReason, title: stripMarkdownBold(gap.title), diagnosis: stripMarkdownBold(groundedDiagnosis(gap.diagnosis, errorReason)), concepts: gap.concepts.map((concept) => stripMarkdownBold(concept)) };
          }
          continue;
        }
        const response = await calls.completeJSON(GRADE_EXAM_PROMPT, JSON.stringify({
          chapter: boundedChapter, question, rubricElements: elements, answer: answer.answer, taught: messages, unlearned: !hasLearnedAnswer(answer, messages),
        }), gradeExamSchema({ qid: question.qid, rubricCount: elements.length, chapterText: chapter.text, taught: messages, answer: answer.answer, unlearned: !hasLearnedAnswer(answer, messages) }), { temperature: 0, maxOutputTokens: 1_200 });
        // Compute grades from checked rubric elements; never trust a model-generated total or label.
        const fulfilled = response.rubricChecks.filter(Boolean).length;
        const score = response.contradictsSource ? 0 : Math.max(0, Math.min(question.points, Math.round(fulfilled / elements.length * question.points)));
        const verdict = score === question.points ? "CORRECT" : score === 0 ? "WRONG" : "PARTIAL";
        yield { type: "grade", qid: question.qid, score, maxScore: question.points, verdict, comment: stripMarkdownBold(response.comment) };
        if (verdict !== "CORRECT" && response.gap) {
          const errorReason = !hasLearnedAnswer(answer, messages) ? "INSUFFICIENT_LEARNING" : groundedErrorReason({ proposed: response.gap.errorReason, answer: answer.answer, evidenceQuote: response.gap.evidenceQuote, taught: messages, contradictsSource: response.contradictsSource });
          yield { type: "gap", qid: question.qid, ...response.gap, errorReason, title: stripMarkdownBold(response.gap.title), diagnosis: stripMarkdownBold(groundedDiagnosis(response.gap.diagnosis, errorReason)), concepts: response.gap.concepts.map((concept) => stripMarkdownBold(concept)) };
        }
      }
    },

    tutorExplain: createTutorExplain(calls),
  };
}
