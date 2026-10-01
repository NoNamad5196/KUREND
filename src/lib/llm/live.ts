import type { Llm, TaughtMsg } from "./types";
import { completeJSON, streamText } from "./provider";
import {
  analyzeTurnSchema, chaptersSchema, examAnswerSchema,
  gradeExamSchema, prepareSessionSchema,
} from "./schemas";
import {
  compactChapter, compactText, paragraphizeSources, rubricElements,
  uniqueStrings, UNLEARNED_ANSWER,
} from "./text";
import { GENERATE_CHAPTERS_PROMPT } from "./prompts/generate-chapters";
import { PREPARE_SESSION_PROMPT } from "./prompts/prepare-session";
import { ANALYZE_TURN_PROMPT } from "./prompts/analyze-turn";
import { WRITE_EXAM_ANSWER_PROMPT } from "./prompts/write-exam-answer";
import { GRADE_EXAM_PROMPT } from "./prompts/grade-exam";
import { acceptedExplanations, nextObjectiveQuestion } from "./turn-state";
import { createTutorExplain } from "./tutor";

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

    async prepareSession({ chapter, level }) {
      return calls.completeJSON(PREPARE_SESSION_PROMPT, JSON.stringify({
        chapter: compactChapter(chapter), level,
      }), prepareSessionSchema, { temperature: 0.2, maxOutputTokens: 1_500, timeoutMs: 18_000 });
    },

    async *juniorTurn(input) {
      // Keep cumulative accepted teaching, not a tail of mixed USER/JUNIOR
      // messages: a tail can forget an already-completed objective.
      const currentRef = input.history.length + 1;
      const taught = [...acceptedExplanations(input.history), { ref: currentRef, content: input.explanation }];
      const analysis = await calls.completeJSON(ANALYZE_TURN_PROMPT, JSON.stringify({
        chapter: compactChapter(input.chapter), objectives: input.objectives,
        taught, currentRef, explanation: input.explanation,
      }), analyzeTurnSchema(input.explanation, input.objectives.map((objective) => objective.id), taught),
      { temperature: 0, maxOutputTokens: 1_000, timeoutMs: 10_000 });
      const previousConcepts = uniqueStrings(input.heardConcepts);
      const needsDoubt = input.level === "EASY" && analysis.contradictions.length > 0;
      if (needsDoubt) {
        // Only the learner's own words can enter a doubt. Internal "why" and source text never do.
        const claim = compactText(analysis.contradictions[0].claim, 100);
        yield { type: "concepts", heardConcepts: previousConcepts, added: [] };
        yield { type: "doubt", content: `어? “${claim}”라는 설명이 조금 헷갈려. 한 번만 더 설명해줄래?` };
        return;
      }
      // Labels can be Korean paraphrases; their actual evidence must be a
      // validated verbatim quote of this explanation.
      const mentionedConcepts = uniqueStrings(analysis.concepts.map(({ name }) => name));
      const added = mentionedConcepts.filter((concept) => !previousConcepts.includes(concept));
      const heardConcepts = uniqueStrings([...previousConcepts, ...added]);
      const coveredObjectives = uniqueStrings(analysis.coverage.map(({ id }) => id));
      yield { type: "concepts", heardConcepts, added };
      const reaction = analysis.reactionQuote
        ? `“${analysis.reactionQuote}”라고 ${input.level === "HARD" ? "받아쓸게." : "설명해 줬구나."}`
        : input.level === "HARD" ? "응, 말해 준 설명을 받아쓸게." : "응응, 말해 준 설명을 기억할게.";
      yield { type: "reaction", content: reaction };
      yield {
        type: "question", coveredObjectives,
        content: nextObjectiveQuestion(input, coveredObjectives),
      };
    },

    async *writeExamAnswer({ question, taught, heardConcepts }) {
      const messages = taughtMessages(taught);
      const response = messages.length ? await calls.completeJSON(WRITE_EXAM_ANSWER_PROMPT, JSON.stringify({
        // This explicit allowlist is a knowledge boundary: never spread a session/chapter/rubric here.
        question, taught: messages, heardConcepts: uniqueStrings(heardConcepts),
      }), examAnswerSchema(messages), { temperature: 0, maxOutputTokens: 900 }) : {
        thought: "아직 선배에게 들은 설명이 없어.",
        sentences: [{ quote: null, ref: null, level: "NONE" as const }],
        unlearned: true,
      };
      const citedRefs = new Set(response.sentences.map((sentence) => sentence.ref));
      yield { type: "sources", sources: messages.filter((message) => citedRefs.has(message.ref)) };
      for (const token of response.thought) yield { type: "thought", token, closed: false };
      yield { type: "thought", token: "", closed: true };
      const sentences = response.sentences.map((sentence) => ({
        ...sentence, text: sentence.quote === null ? UNLEARNED_ANSWER : `“${sentence.quote}”라고 배웠습니다.`,
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
