import { z } from "zod";
import type { Llm, TaughtMsg } from "./types";
import { completeJSON, streamText } from "./transport";
import {
  analyzeTurnSchema, chaptersSchema, examAnswerSchema,
  gradeExamSchema, prepareSessionSchemaFor, respondTurnSchema, teacherNoteSchema, objectiveGapSchema,
} from "./schemas";
import {
  compactChapter, compactText, paragraphizeSources, rubricElements,
  uniqueStrings, UNLEARNED_ANSWER, isUnlearnedAnswer,
} from "./text";
import { GENERATE_CHAPTERS_PROMPT } from "./prompts/generate-chapters";
import { PREPARE_SESSION_PROMPT, OBJECTIVE_EXAM_PROMPT, KU_EXAM_PROMPT, FEMALE_EXAM_PROMPT, examPlanPrompt } from "./prompts/prepare-session";
import { isObjectiveQuestion, pointsPlan } from "@/contracts/game";
import { ANALYZE_TURN_PROMPT } from "./prompts/analyze-turn";
import { RESPOND_TURN_PROMPT } from "./prompts/respond-turn";
import { WRITE_EXAM_ANSWER_PROMPT, OBJECTIVE_ANSWER_PROMPT } from "./prompts/write-exam-answer";
import { GRADE_EXAM_PROMPT, OBJECTIVE_GAP_PROMPT } from "./prompts/grade-exam";
import { acceptedExplanations, nextObjectiveQuestion } from "./turn-state";
import { createTutorExplain } from "./tutor";
import { TEACHER_NOTE_PROMPT } from "./prompts/teacher-note";
import { personaFor, normalizePersonaAddress, personaQuestion } from "./personas";
import { objectiveTopic, teachingChoicesFor, isUnknownTeaching, selectedTeachingObjective } from "./teaching-choices";
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
  const plain = text.replace(/[\s.,!?“”"'()·~\-:;]/gu, "");
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

export type LiveProviderCalls = {
  completeJSON: typeof completeJSON;
  streamText: typeof streamText;
};

export function createLiveLlm(calls: LiveProviderCalls = { completeJSON, streamText }): Llm {
  return {
    async generateTeacherNote({ chapter }) {
      return calls.completeJSON(TEACHER_NOTE_PROMPT, JSON.stringify({ chapter: compactChapter(chapter) }), teacherNoteSchema,
        { temperature: 0.2, maxOutputTokens: 1_200 });
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

    async prepareSession({ chapter, level, persona, examFormat, questionCount, kind }) {
      const spec = personaFor(persona);
      const format = examFormat ?? spec?.examFormat ?? "DESCRIPTIVE";
      const count = questionCount ?? 3;
      const plan = pointsPlan(count);
      const objectiveIndexes = plan.flatMap((_, i) => isObjectiveQuestion(format, i, count) ? [i] : []);
      const instruction = format === "OBJECTIVE" ? OBJECTIVE_EXAM_PROMPT : persona === "KU_HARD" ? KU_EXAM_PROMPT : persona === "FEMALE_NORMAL" ? FEMALE_EXAM_PROMPT : "";
      const prepared = await calls.completeJSON(`${PREPARE_SESSION_PROMPT}\n${instruction}\n${examPlanPrompt(count, plan, objectiveIndexes, kind)}`, JSON.stringify({
        chapter: compactChapter(chapter), level, persona: spec, examFormat: format, questionCount: count, kind: kind ?? "CHAPTER",
      }), prepareSessionSchemaFor(count, objectiveIndexes), {
        temperature: 0.2, stage: "prepare-session",
        maxOutputTokens: Math.max(1_500, 500 + count * (objectiveIndexes.length ? 480 : 320)),
        timeoutMs: Math.max(18_000, 8_000 + count * 4_000),
      });
      const topic = objectiveTopic(prepared.objectives[0]);
      return { ...prepared,
        firstQuestion: persona ? personaQuestion(topic, persona, true) : prepared.firstQuestion,
        ...(persona === "MALE_EASY" ? { firstTeachingChoices: teachingChoicesFor(chapter, topic) } : {}),
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
      const selectedObjective = selectedTeachingObjective(input);
      const previousConcepts = uniqueStrings(input.heardConcepts);
      const needsDoubt = input.persona !== "MALE_EASY" && analysis.contradictions.length > 0 && (input.persona !== undefined || input.level === "EASY");
      if (needsDoubt) {
        // Only the learner's own words can enter a doubt. Internal "why" and source text never do.
        const claim = compactText(analysis.contradictions[0].claim, 100);
        yield { type: "concepts", heardConcepts: previousConcepts, added: [] };
        yield { type: "doubt", content: input.persona === "KU_HARD"
          ? `잠깐만 선배. “${claim}”라는 건 내가 이해한 게 맞아?`
          : input.persona === "FEMALE_NORMAL" ? `“${claim}”라면 왜 그런가요, 선배님?`
          : `어? “${claim}”라는 설명이 조금 헷갈려. 한 번만 더 설명해줄래?` };
        return;
      }
      // Labels can be Korean paraphrases; their actual evidence must be a
      // validated verbatim quote of this explanation.
      const mentionedConcepts = unknown ? [] : uniqueStrings([
        ...analysis.concepts.map(({ name }) => name),
        ...(selectedObjective ? [objectiveTopic(input.objectives.find((item) => item.id === selectedObjective)!)] : []),
      ]);
      const added = mentionedConcepts.filter((concept) => !previousConcepts.includes(concept));
      const heardConcepts = uniqueStrings([...previousConcepts, ...added]);
      const coverage = analysis.coverage.filter((item) => !unknown || item.evidence.some((evidence) => evidence.ref !== currentRef));
      const currentObjectives = unknown ? [] : uniqueStrings([
        ...coverage.filter((item) => item.evidence.some((evidence) => evidence.ref === currentRef)).map(({ id }) => id),
        ...(selectedObjective ? [selectedObjective] : []),
      ]);
      const progress = advanceMastery(input, currentObjectives, uniqueStrings([...coverage.map(({ id }) => id), ...(selectedObjective ? [selectedObjective] : [])]));
      const { coveredObjectives } = progress;
      yield { type: "concepts", heardConcepts, added };
      // Keep persona progress and question selection deterministic, but let
      // provider failures reach the saved-turn retry flow instead of faking a reply.
      const nextObjective = input.objectives.find((objective) => !coveredObjectives.includes(objective.id));
      const fallbackQuestion = input.persona && nextObjective
        ? personaQuestion(objectiveTopic(nextObjective), input.persona)
        : normalizePersonaAddress(nextObjectiveQuestion(input, coveredObjectives), input.persona);
      const persona = personaFor(input.persona);
      const responded = await calls.completeJSON(`${RESPOND_TURN_PROMPT}${persona ? `\n현재 후배: ${persona.name}. 말투: ${persona.voice}` : ""}`, JSON.stringify({
          level: input.level,
          persona: input.persona ? { id: input.persona, ...persona } : null,
          history: input.history.slice(-6).map(({ role, stage, content }) => ({ role, stage, content: compactText(content, 240) })),
          explanation: input.explanation,
          analysis: { heardConcepts, contradictionClaims: [], coveredObjectives },
          objectives: input.objectives.map(({ id, text }) => ({ id, text })),
          nextQuestionHint: fallbackQuestion,
      }), respondTurnSchema, { temperature: 0.7, maxOutputTokens: 400, timeoutMs: 12_000, stage: "respond-turn" });
      const reactions = unknown ? [input.persona === "KU_HARD" ? "괜찮아. 아직 못 배웠으니 함께 다시 보자." : "괜찮아요. 아직 배우지 않은 걸로 둘게요."] : responded.reactions;
      let question = unknown ? fallbackQuestion : responded.question;
      if (input.persona === "KU_HARD" && nextObjective && currentObjectives.includes(nextObjective.id)) question = fallbackQuestion;
      if (input.persona === "FEMALE_NORMAL" && nextObjective && !/왜|의미|이유/u.test(question)) question = fallbackQuestion;
      for (const content of reactions) yield { type: "reaction", content: normalizePersonaAddress(content, input.persona).slice(0, 40) };
      yield { type: "question", coveredObjectives, content: normalizePersonaAddress(
        input.persona === "MALE_EASY" && nextObjective ? fallbackQuestion : question, input.persona),
        ...(progress.mastery ? { mastery: progress.mastery } : {}),
        ...(input.persona === "MALE_EASY" && nextObjective ? { teachingChoices: teachingChoicesFor(input.chapter, objectiveTopic(nextObjective)) } : {}),
      };
    },

    async *writeExamAnswer({ question, taught, heardConcepts, choices, persona }) {
      const messages = taughtMessages(taught);
      const response = messages.length ? await calls.completeJSON(`${WRITE_EXAM_ANSWER_PROMPT}${choices ? OBJECTIVE_ANSWER_PROMPT : ""}`, JSON.stringify({
        // This explicit allowlist is a knowledge boundary: never spread a session/chapter/rubric here.
        question, taught: messages, heardConcepts: uniqueStrings(heardConcepts), choices,
      }), examAnswerSchema(messages, choices), { temperature: 0, maxOutputTokens: 900 })
        .catch(async () => {
          const fallback = fallbackExamAnswer(question, messages, choices);
          if (!choices?.length) return fallback;
          // 근거 문장은 결정적으로 고르고, 보기 번호만 모델에게 한 번 더 묻는다(가르친 내용만 근거).
          const picked = await calls.completeJSON(
            "당신은 선배에게 들은 설명(taught)만 아는 새내기입니다. 보기의 사실이 아니라 taught 의 내용과 가장 맞는 보기 번호 하나를 고르세요. JSON {\"choice\":\"①\"|\"②\"|\"③\"|\"④\"} 만 출력하세요.",
            JSON.stringify({ question, taught: messages, choices }),
            z.object({ choice: z.enum(CHOICE_MARKS) }), { temperature: 0, maxOutputTokens: 60, timeoutMs: 8_000 },
          ).catch(() => null);
          return picked ? { ...fallback, choice: picked.choice } : fallback;
        }) : {
        thought: "아직 선배에게 들은 설명이 없어.",
        sentences: [{ quote: null, ref: null, level: "NONE" as const }],
        unlearned: true, choice: choices ? "①" : undefined,
      };
      const citedRefs = new Set(response.sentences.map((sentence) => sentence.ref));
      yield { type: "sources", sources: messages.filter((message) => citedRefs.has(message.ref)) };
      for (const token of normalizePersonaAddress(response.thought, persona)) yield { type: "thought", token, closed: false };
      yield { type: "thought", token: "", closed: true };
      const sentences = response.sentences.map((sentence, index) => ({
        ...sentence, text: `${index === 0 && choices ? `${response.choice} ` : ""}${sentence.quote === null ? normalizePersonaAddress(UNLEARNED_ANSWER, persona) : `“${sentence.quote}”라고 배웠습니다.`}`,
      }));
      for (const sentence of sentences) {
        yield {
          type: "sentence", text: sentence.text, ref: sentence.ref,
          level: sentence.ref === null ? "NONE" : sentence.level,
          unlearned: response.unlearned || sentence.ref === null,
        };
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
          const selected = answer.answer.match(/^([①②③④])/u)?.[1];
          // A guessed option receives no credit, including each persona's
          // canonical wording for a topic they have not learned.
          const guessed = isUnlearnedAnswer(answer.answer)
            || answer.answer.includes(UNLEARNED_ANSWER)
            || answer.answer.includes(normalizePersonaAddress(UNLEARNED_ANSWER, "FEMALE_NORMAL"));
          const correct = selected === key && !guessed;
          yield { type: "grade", qid: question.qid, score: correct ? question.points : 0,
            maxScore: question.points, verdict: correct ? "CORRECT" : "WRONG",
            comment: correct ? "선배에게 배운 내용과 일치하는 보기를 골랐습니다."
              : guessed ? "배운 근거 없이 보기를 찍었습니다. 이 부분은 아직 가르치지 않았어요." : "선택한 보기가 자료의 정답과 다릅니다." };
          if (!correct) {
            const { gap } = await calls.completeJSON(OBJECTIVE_GAP_PROMPT, JSON.stringify({
              chapter: boundedChapter, question, answer: answer.answer, taught: messages,
            }), objectiveGapSchema(chapter.text, messages), { temperature: 0, maxOutputTokens: 900 });
            yield { type: "gap", qid: question.qid, ...gap };
          }
          continue;
        }
        const response = await calls.completeJSON(GRADE_EXAM_PROMPT, JSON.stringify({
          chapter: boundedChapter, question, rubricElements: elements, answer: answer.answer, taught: messages,
        }), gradeExamSchema({ qid: question.qid, rubricCount: elements.length, chapterText: chapter.text, taught: messages, answer: answer.answer }), { temperature: 0, maxOutputTokens: 1_200 });
        // Compute grades from checked rubric elements; never trust a model-generated total or label.
        const fulfilled = response.rubricChecks.filter(Boolean).length;
        const score = response.contradictsSource ? 0 : Math.max(0, Math.min(question.points, Math.round(fulfilled / elements.length * question.points)));
        const verdict = score === question.points ? "CORRECT" : score === 0 ? "WRONG" : "PARTIAL";
        yield { type: "grade", qid: question.qid, score, maxScore: question.points, verdict, comment: response.comment };
        if (verdict !== "CORRECT" && response.gap) {
          yield { type: "gap", qid: question.qid, ...response.gap };
        }
      }
    },

    tutorExplain: createTutorExplain(calls),
  };
}
