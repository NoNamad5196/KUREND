import { LearningErrorReasonSchema, type LearningErrorReason } from "@/contracts/types";

export const LEARNING_ERROR_LABELS: Record<LearningErrorReason, string> = {
  WRONG_KNOWLEDGE: "잘못된 지식을 학습해서 틀렸습니다.",
  INSUFFICIENT_LEARNING: "관련 개념을 충분히 배우지 못했습니다.",
  CONFUSION: "배운 개념을 서로 혼동했습니다.",
  UNKNOWN: "현재 학습 기록만으로 원인을 판단하기 어렵습니다.",
};

/** Preserve the existing string array; old readers ignore the additive metadata entry. */
export function encodeGapConcepts(concepts: string[], errorReason?: LearningErrorReason): string {
  return JSON.stringify([...concepts, ...(errorReason ? [{ learningErrorReason: errorReason }] : [])]);
}

export function decodeGapConcepts(raw: string | null | undefined): { concepts: string[]; errorReason?: LearningErrorReason } {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return { concepts: [] };
    const metadata = value.find((item) => item && typeof item === "object" && "learningErrorReason" in item);
    const reason = LearningErrorReasonSchema.safeParse(metadata?.learningErrorReason);
    return { concepts: value.filter((item): item is string => typeof item === "string"), ...(reason.success ? { errorReason: reason.data } : {}) };
  } catch { return { concepts: [] }; }
}
