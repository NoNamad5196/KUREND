import type { ConceptMasteryDto } from "@/contracts/game";
import type { Llm } from "./types";
import { acceptedExplanations } from "./turn-state";
import { objectiveTopic } from "./teaching-choices";

type Turn = Parameters<Llm["juniorTurn"]>[0];

/** Repeat means a new explanation, not resending the same words. */
export function advanceMastery(input: Turn, currentObjectives: string[], covered: string[]) {
  if (!input.persona) return { coveredObjectives: covered, mastery: undefined };
  const mastery: ConceptMasteryDto[] = (input.mastery ?? []).map((item) => ({ ...item }));
  const normalized = (text: string) => text.replace(/\s|[.!?。！？]/gu, "");
  const duplicate = acceptedExplanations(input.history).some((item) => normalized(item.content) === normalized(input.explanation));
  for (const objective of input.objectives) {
    if (!currentObjectives.includes(objective.id)) continue;
    const concept = objectiveTopic(objective);
    let item = mastery.find((entry) => entry.concept === concept);
    if (!item) { item = { concept, exposureCount: 0, mastery: 0 }; mastery.push(item); }
    if (!duplicate) item.exposureCount += 1;
    item.mastery = input.persona === "KU_HARD" ? Math.min(100, item.exposureCount * 50) : 100;
  }
  const remembered = input.objectives.filter((objective) => mastery.some((item) =>
    item.concept === objectiveTopic(objective) && item.mastery >= 100)).map(({ id }) => id);
  return { mastery, coveredObjectives: input.persona === "KU_HARD"
    ? remembered
    : [...new Set([...covered, ...remembered])] };
}
