import type { ConceptMasteryDto } from "@/contracts/game";
import type { ObjectiveDto } from "@/contracts/types";
import { objectiveTopic } from "@/lib/llm/teaching-choices";

/** Restore progress from account data when this browser has no SSE/local cache. */
export function coveredTeachingObjectives(objectives: ObjectiveDto[], covered: string[], mastery: ConceptMasteryDto[] = []): string[] {
  return objectives.filter((objective) => covered.includes(objective.id)
    || mastery.some((item) => item.concept === objectiveTopic(objective) && item.mastery >= 100)).map((objective) => objective.id);
}
