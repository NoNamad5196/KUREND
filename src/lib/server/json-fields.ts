/** [C 소유] SQLite 의 "String 에 JSON 문자열" 필드 파서. 깨진 값은 빈 배열로 처리한다. */
import type { AnswerSentenceDto, ObjectiveDto, RecallLevel } from "@/contracts/types";

export function parseStringArray(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function parseObjectives(raw: string | null | undefined): ObjectiveDto[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((o) => o && typeof o === "object" && typeof o.id === "string" && typeof o.text === "string")
      .map((o) => ({ id: o.id as string, text: o.text as string }));
  } catch {
    return [];
  }
}

const LEVELS: RecallLevel[] = ["STRONG", "FAINT", "NONE"];

export function parseSentences(raw: string | null | undefined): AnswerSentenceDto[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((s) => s && typeof s === "object" && typeof s.sentence === "string")
      .map((s) => ({
        sentence: s.sentence as string,
        ref: typeof s.ref === "number" ? s.ref : null,
        level: LEVELS.includes(s.level) ? (s.level as RecallLevel) : "NONE",
        unlearned: Boolean(s.unlearned),
      }));
  } catch {
    return [];
  }
}

export const toJson = (v: unknown) => JSON.stringify(v ?? []);
