import type { Llm, TaughtMsg } from "./types";

type Turn = Parameters<Llm["juniorTurn"]>[0];

/** A doubt rejects that entire turn; the rejected claim is not prior teaching. */
export function acceptedExplanations(history: Turn["history"]): TaughtMsg[] {
  const accepted: TaughtMsg[] = [];
  let pending: TaughtMsg | undefined;
  let rejected = false;
  const flush = () => {
    if (pending && !rejected && pending.content.trim()) accepted.push(pending);
  };
  for (const [index, message] of history.entries()) {
    if (message.role === "USER") {
      flush();
      pending = { ref: index + 1, content: message.content };
      rejected = false;
    } else if (message.stage === "DOUBT") {
      rejected = true;
    }
  }
  flush();
  return accepted;
}

export function nextObjectiveQuestion(input: Turn, coveredObjectives: string[]): string {
  const index = input.objectives.findIndex((objective) => !coveredObjectives.includes(objective.id));
  if (index < 0) return "응응, 더 말해 줘! 궁금한 거 생기면 물어볼게.";
  // Ask the exact prepared learning target; chapter points can be broader.
  const topic = input.objectives[index].text.replace(/(?:을|를)?\s*설명할 수 있다[.!]?\s*$/, "").trim();
  return input.level === "HARD" ? `${topic}도 말해 줘. 받아쓸게.` : `선배, ${topic}도 알려줄래?`;
}
