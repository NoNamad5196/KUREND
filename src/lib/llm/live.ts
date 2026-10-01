import type { Llm, TaughtMsg } from "./types";
import { completeJSON, streamText } from "./provider";
import {
  analyzeTurnSchema, chaptersSchema, examAnswerSchema,
  gradeExamSchema, prepareSessionSchemaFor, respondTurnSchema, teacherNoteSchema, objectiveGapSchema,
} from "./schemas";
import {
  compactChapter, compactText, paragraphizeSources, rubricElements,
  uniqueStrings, UNLEARNED_ANSWER,
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
import { personaFor } from "./personas";

function taughtMessages(messages: TaughtMsg[]): TaughtMsg[] {
  const refs = new Set<number>();
  return messages.map(({ ref, content }) => {
    if (!Number.isInteger(ref) || ref < 1 || refs.has(ref)) throw new Error("사용자 설명 참조 번호가 올바르지 않습니다.");
    refs.add(ref);
    return { ref, content };
  }).filter(({ content }) => content.trim().length > 0);
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
      return calls.completeJSON(`${PREPARE_SESSION_PROMPT}\n${instruction}\n${examPlanPrompt(count, plan, objectiveIndexes, kind)}`, JSON.stringify({
        chapter: compactChapter(chapter), level, persona: spec, examFormat: format, questionCount: count, kind: kind ?? "CHAPTER",
      }), prepareSessionSchemaFor(count, objectiveIndexes), {
        temperature: 0.2,
        // 문항당 출력이 늘어난다(객관식 보기 포함). 10문항 혼합 ≈ 5천 토큰
        maxOutputTokens: Math.max(1_500, 500 + count * (objectiveIndexes.length ? 480 : 320)),
        timeoutMs: Math.max(18_000, 8_000 + count * 4_000),
      });
    },

    async *juniorTurn(input) {
      // Keep cumulative accepted teaching, not a tail of mixed USER/JUNIOR
      // messages: a tail can forget an already-completed objective.
      const currentRef = input.history.length + 1;
      const taught = [...acceptedExplanations(input.history), { ref: currentRef, content: input.explanation }];
      const analysis = await calls.completeJSON(ANALYZE_TURN_PROMPT, JSON.stringify({
        chapter: compactChapter(input.chapter), objectives: input.objectives,
        taught, currentRef, explanation: input.explanation,
        ...(input.persona ? { persona: {
          voice: personaFor(input.persona)?.voice, comprehension: personaFor(input.persona)?.comprehension,
          memory: personaFor(input.persona)?.memory, misunderstanding: personaFor(input.persona)?.misunderstanding,
          doubtFrequency: personaFor(input.persona)?.doubtFrequency,
        } } : {}),
      }), analyzeTurnSchema(input.explanation, input.objectives.map((objective) => objective.id), taught),
      { temperature: 0, maxOutputTokens: 1_000, timeoutMs: 10_000 });
      const previousConcepts = uniqueStrings(input.heardConcepts);
      const needsDoubt = analysis.contradictions.length > 0 && (input.persona !== undefined || input.level === "EASY");
      if (needsDoubt) {
        // Only the learner's own words can enter a doubt. Internal "why" and source text never do.
        const claim = compactText(analysis.contradictions[0].claim, 100);
        yield { type: "concepts", heardConcepts: previousConcepts, added: [] };
        yield { type: "doubt", content: input.persona === "KU_HARD"
          ? `잠깐만 선배. “${claim}”라는 건 내가 이해한 게 맞아?`
          : input.persona === "FEMALE_NORMAL" ? `“${claim}”라면 왜 그런가요, 선배?`
          : `어? “${claim}”라는 설명이 조금 헷갈려. 한 번만 더 설명해줄래?` };
        return;
      }
      // Labels can be Korean paraphrases; their actual evidence must be a
      // validated verbatim quote of this explanation.
      const mentionedConcepts = uniqueStrings(analysis.concepts.map(({ name }) => name));
      const added = mentionedConcepts.filter((concept) => !previousConcepts.includes(concept));
      const heardConcepts = uniqueStrings([...previousConcepts, ...added]);
      const coveredObjectives = uniqueStrings(analysis.coverage.map(({ id }) => id));
      yield { type: "concepts", heardConcepts, added };
      // 반응·다음 질문은 모델이 대화 맥락에 맞춰 쓴다(분석 결과로 범위를 고정). 형식을 벗어나면 템플릿 문장으로 대체.
      const fallbackReaction = analysis.reactionQuote
        ? `“${analysis.reactionQuote}”라고 ${input.level === "HARD" ? "받아쓸게." : "설명해 줬구나."}`
        : input.persona ? personaFor(input.persona)!.examples.reaction
          : input.level === "HARD" ? "응, 말해 준 설명을 받아쓸게." : "응응, 말해 준 설명을 기억할게.";
      const fallbackQuestion = input.persona === "FEMALE_NORMAL" && coveredObjectives.length < input.objectives.length
        ? `${input.objectives.find((objective) => !coveredObjectives.includes(objective.id))?.text.replace(/(?:을|를)?\s*설명할 수 있다[.!?]?$/u, "") ?? "이 부분"}은 왜 그런가요, 선배?`
        : nextObjectiveQuestion(input, coveredObjectives);
      let reactions = [fallbackReaction];
      let question = fallbackQuestion;
      try {
        const responded = await calls.completeJSON(RESPOND_TURN_PROMPT, JSON.stringify({
          level: input.level,
          persona: input.persona ?? null,
          history: input.history.slice(-6).map(({ role, stage, content }) => ({ role, stage, content: compactText(content, 240) })),
          explanation: input.explanation,
          analysis: { heardConcepts, contradictionClaims: [], coveredObjectives },
          objectives: input.objectives.map(({ id, text }) => ({ id, text })),
          nextQuestionHint: fallbackQuestion,
        }), respondTurnSchema, { temperature: 0.7, maxOutputTokens: 400, timeoutMs: 12_000 });
        reactions = responded.reactions;
        question = responded.question;
      } catch {
        /* 템플릿 유지 */
      }
      for (const content of reactions) yield { type: "reaction", content };
      yield { type: "question", coveredObjectives, content: question };
    },

    async *writeExamAnswer({ question, taught, heardConcepts, choices }) {
      const messages = taughtMessages(taught);
      const response = messages.length ? await calls.completeJSON(`${WRITE_EXAM_ANSWER_PROMPT}${choices ? OBJECTIVE_ANSWER_PROMPT : ""}`, JSON.stringify({
        // This explicit allowlist is a knowledge boundary: never spread a session/chapter/rubric here.
        question, taught: messages, heardConcepts: uniqueStrings(heardConcepts), choices,
      }), examAnswerSchema(messages, choices), { temperature: 0, maxOutputTokens: 900 }) : {
        thought: "아직 선배에게 들은 설명이 없어.",
        sentences: [{ quote: null, ref: null, level: "NONE" as const }],
        unlearned: true, choice: choices ? "①" : undefined,
      };
      const citedRefs = new Set(response.sentences.map((sentence) => sentence.ref));
      yield { type: "sources", sources: messages.filter((message) => citedRefs.has(message.ref)) };
      for (const token of response.thought) yield { type: "thought", token, closed: false };
      yield { type: "thought", token: "", closed: true };
      const sentences = response.sentences.map((sentence, index) => ({
        ...sentence, text: `${index === 0 && choices ? `${response.choice} ` : ""}${sentence.quote === null ? UNLEARNED_ANSWER : `“${sentence.quote}”라고 배웠습니다.`}`,
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
          const correct = selected === key;
          yield { type: "grade", qid: question.qid, score: correct ? question.points : 0,
            maxScore: question.points, verdict: correct ? "CORRECT" : "WRONG",
            comment: correct ? "선배에게 배운 내용과 일치하는 보기를 골랐습니다." : "선택한 보기가 자료의 정답과 다릅니다." };
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
