import type { SseEvent } from "@/contracts/events";
import type { RecallLevel } from "@/contracts/types";

export type AnswerPlayback = {
  text: string; sources: Array<{ ref: number; content: string }>;
  highlights: Record<number, RecallLevel>; unlearned: boolean;
  thought: string; thoughtClosed: boolean; saved: boolean; cached: boolean;
};
export function emptyPlayback(): AnswerPlayback {
  return { text: "", sources: [], highlights: {}, unlearned: false, thought: "", thoughtClosed: false, saved: false, cached: false };
}
export function reduceAnswer(state: AnswerPlayback, event: SseEvent): AnswerPlayback {
  switch (event.event) {
    case "answer.sources": return { ...state, sources: event.data.sources };
    case "answer.thought": return { ...state, thought: state.thought + event.data.token, thoughtClosed: event.data.closed };
    case "answer.token": {
      // answer.token은 문장 단위이며 저장된 답안과 같은 문장 간격을 유지한다.
      const separator = state.text && !/\s$/.test(state.text) && !/^\s/.test(event.data.token) ? " " : "";
      return { ...state, text: state.text + separator + event.data.token };
    }
    case "answer.recall": return { ...state, unlearned: state.unlearned || event.data.unlearned, highlights: event.data.ref === null ? state.highlights : { ...state.highlights, [event.data.ref]: event.data.level } };
    case "answer.recap": return {
      ...state, text: event.data.sentences.map((sentence) => sentence.sentence).join(" "), cached: true,
      unlearned: event.data.sentences.some((sentence) => sentence.unlearned),
      highlights: Object.fromEntries(event.data.sentences.filter((sentence) => sentence.ref !== null).map((sentence) => [sentence.ref, sentence.level])),
    };
    case "answer.saved": return { ...state, text: event.data.answer, saved: true, cached: event.data.cached };
    default: return state;
  }
}
