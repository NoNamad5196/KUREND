import type { LearningErrorReason } from "@/contracts/types";
import { answerStyle, containsUnlearnedAnswer, plainText } from "./text";

function grams(text: string): Set<string> {
  const clean = plainText(text).replace(/^[①②③④]\s*/u, "").replace(/[\s\p{P}]/gu, "").toLowerCase();
  return new Set(Array.from({ length: Math.max(0, clean.length - 1) }, (_, i) => clean.slice(i, i + 2)));
}
export function evidenceSimilarity(left: string, right: string): number {
  const a = grams(left); const b = grams(right);
  if (!a.size || !b.size) return 0;
  return 2 * [...a].filter((item) => b.has(item)).length / (a.size + b.size);
}

/** Only learner evidence decides a choice. No chapter, rubric, key, or provider preference enters here. */
export function groundedChoice(choices: string[], quotes: string[]): string | null {
  if (!quotes.length) return null;
  const ranked = choices.map((choice) => ({ choice, score: Math.max(...quotes.map((quote) => evidenceSimilarity(quote, choice))) }))
    .sort((a, b) => b.score - a.score);
  // An ambiguous lexical match is not evidence for guessing a correct answer.
  if (!ranked[0] || ranked[0].score < 0.25 || (ranked[1] && ranked[0].score - ranked[1].score < 0.015)) return null;
  return ranked[0].choice.slice(0, 1);
}

/** A substring citation must not discard a condition or negation in the same taught sentence. */
export function completeTeachingQuote(quote: string, content: string): string {
  const at = content.indexOf(quote);
  if (at < 0) return quote;
  const boundaries = [...content.matchAll(/(?<=[.!?。！？])\s+|\n+/gu)];
  let start = 0; let end = content.length;
  for (const boundary of boundaries) {
    const from = boundary.index!; const to = from + boundary[0].length;
    if (to <= at) start = to;
    if (from >= at + quote.length) { end = from; break; }
  }
  return content.slice(start, end).trim();
}

/** Grammar conversion only: model paraphrases can silently repair one crucial word in a false claim. */
export function answerFromQuote(quote: string): string {
  return answerStyle(plainText(quote).replace(/^(?:[-*+•]\s+|>\s*)/u, "").replace(/^[“"']|[”"']$/gu, "")
    .replace(/^(?:선배님?|음+|아+|어+|그러니까|그니까|즉|자|일단)\s*[,，]?\s+/u, "")
    .replace(/(상태|개념|의미|방식|관계|과정|원리|조건|방법|형태|용어|기능|구조)야(?=[.!?]?$)/u, "$1이다").trim());
}

export function groundedErrorReason(input: {
  proposed?: LearningErrorReason; answer: string; evidenceQuote: string; taught: { content: string }[];
  contradictsSource?: boolean; wrongObjective?: boolean; choices?: string[];
}): LearningErrorReason {
  if (containsUnlearnedAnswer(input.answer)) return "INSUFFICIENT_LEARNING";
  const evidence = input.evidenceQuote.trim();
  const validQuote = !!evidence && input.taught.some((message) => message.content.includes(evidence));
  if (!validQuote) return input.proposed === "INSUFFICIENT_LEARNING" ? "INSUFFICIENT_LEARNING" : "UNKNOWN";
  const selected = input.answer.match(/^[①②③④]/u)?.[0];
  const followedTeaching = input.choices && selected
    ? groundedChoice(input.choices, [evidence]) === selected
    : input.answer.replace(/\s+/gu, "").includes(answerFromQuote(evidence).replace(/\s+/gu, ""));
  if (followedTeaching && (input.contradictsSource || input.wrongObjective)) return "WRONG_KNOWLEDGE";
  if (input.proposed === "CONFUSION") return "CONFUSION";
  if (input.proposed === "INSUFFICIENT_LEARNING") return "INSUFFICIENT_LEARNING";
  return "UNKNOWN";
}
