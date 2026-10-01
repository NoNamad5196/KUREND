import type { LearningErrorReason } from "@/contracts/types";
import { containsUnlearnedAnswer } from "./text";
import { plainExamAnswer } from "@/lib/shared/exam-answer-text";
import { examChoiceIndex } from "@/lib/shared/exam-format";
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import { LEARNING_ERROR_LABELS } from "@/lib/learning/error-reason";

function grams(text: string): Set<string> {
  const clean = stripMarkdownBold(text).replace(/^(?:[①②③④]|[1-4]번)\s*/u, "").replace(/[\s\p{P}]/gu, "").toLowerCase();
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
  // Lexical similarity alone would rank a negated proposition almost exactly
  // like its positive opposite. Without compatible wording, abstain rather
  // than silently correcting the learner's belief or inferring an alternative.
  const negative = (text: string) => /아니|않|없|못/u.test(text);
  const ranked = choices.map((choice) => ({ choice, score: Math.max(...quotes.map((quote) =>
    negative(quote) === negative(choice) ? evidenceSimilarity(quote, choice) : 0)) }))
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
  return plainExamAnswer(quote);
}

export function groundedErrorReason(input: {
  proposed?: LearningErrorReason; answer: string; evidenceQuote: string; taught: { content: string }[];
  contradictsSource?: boolean; wrongObjective?: boolean; choices?: string[]; unlearned?: boolean;
}): LearningErrorReason {
  if (input.unlearned || containsUnlearnedAnswer(input.answer)) return "INSUFFICIENT_LEARNING";
  const evidence = input.evidenceQuote.trim();
  const validQuote = !!evidence && input.taught.some((message) => message.content.includes(evidence));
  if (!validQuote) return input.proposed === "INSUFFICIENT_LEARNING" ? "INSUFFICIENT_LEARNING" : "UNKNOWN";
  const selected = examChoiceIndex(input.answer);
  const choice = input.choices ? groundedChoice(input.choices, [evidence]) : null;
  const followedTeaching = input.choices && selected >= 0
    ? choice !== null && examChoiceIndex(choice) === selected
    : input.answer.replace(/\s+/gu, "").includes(answerFromQuote(evidence).replace(/\s+/gu, ""));
  if (followedTeaching && (input.contradictsSource || input.wrongObjective)) return "WRONG_KNOWLEDGE";
  if (input.proposed === "CONFUSION") return "CONFUSION";
  if (input.proposed === "INSUFFICIENT_LEARNING") return "INSUFFICIENT_LEARNING";
  return "UNKNOWN";
}

/** Generated diagnosis only: source excerpts and USER evidence are immutable.
 * The cause label must reflect the verified reason, not a model's proposal. */
export function groundedDiagnosis(diagnosis: string, reason: LearningErrorReason): string {
  const detail = Object.values(LEARNING_ERROR_LABELS).reduce((text, label) => text.replaceAll(label, ""), diagnosis).trim();
  return `${LEARNING_ERROR_LABELS[reason]}${detail ? ` ${detail}` : ""}`;
}
