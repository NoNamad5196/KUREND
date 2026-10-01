import { TeachingChoicesSchema, type TeachingChoiceDto } from "@/contracts/types";
import type { ChapterText, Llm } from "./types";

export const objectiveTopic = (objective: { text: string }): string =>
  objective.text.replace(/(?:을|를)?\s*설명할 수 있다[.!?]?$/u, "").trim();

/** Prefer the most specific topic when objective names overlap. */
export function matchQuestionObjective<T extends { id: string; text: string }>(objectives: T[], question: string): T | undefined {
  const compact = (text: string) => text.replace(/\s+/gu, "");
  return [...objectives].sort((a, b) => objectiveTopic(b).length - objectiveTopic(a).length)
    .find((objective) => compact(question).includes(compact(objectiveTopic(objective))));
}

function topicTerms(topic: string): string[] {
  return (topic.match(/[가-힣A-Za-z0-9]{2,}/gu) ?? [])
    .map((term) => term.replace(/(?:의|과|와|을|를|은|는)$/u, ""))
    .filter((term) => term.length >= 2 && !/^(?:vs|및|핵심|개념|내용|이유|의미)$/iu.test(term));
}

/** Course/document directions name topics without teaching facts about them. */
function isMaterialDirection(text: string): boolean {
  return /(?:학습|설명|수업|교육)\s*목표/u.test(text)
    || /(?:이|본)\s*(?:자료|문서|강의노트|장|절|단원|수업).{0,35}(?:목표|목적|다룬다|다룹니다|살펴본다|알아본다|소개한다|익히기|작성한)/u.test(text);
}

function supportsTopic(statement: string, topic: string): boolean {
  if (isMaterialDirection(statement)) return false;
  if (statement.includes(topic)) return true;
  const terms = topicTerms(topic);
  return terms.length > 0 && terms.every((term) => statement.includes(term));
}

/** Source-only authoring aid. No exam choices, answer key or outside facts enter here. */
export function teachingChoicesFor(chapter: ChapterText, topic: string): TeachingChoiceDto[] {
  const terms = topicTerms(topic);
  const sentences = (chapter.text.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu) ?? [])
    .map((text) => text.trim()).filter((text) => text.length > 12 && text.length <= 900 && !text.startsWith("#") && !isMaterialDirection(text));
  const ranked = sentences.map((text, index) => {
    const matches = terms.filter((term) => text.includes(term)).length;
    // For a causes/conditions topic, prefer an actual relationship or list of
    // conditions over an equally matching generic definition. This only ranks
    // source sentences; it does not establish semantic coverage or mastery.
    const relationship = matches > 0 && /요인|원인|조건/u.test(topic)
      ? Math.min(3, (text.match(/[,·]/gu) ?? []).length) + Number(/때|면|따라|때문|영향|조건/u.test(text)) : 0;
    return { text, index, score: matches * 10 + relationship };
  })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const fact = ranked.find((item) => item.score === ranked[0]?.score && item.text.length <= 240)?.text ?? ranked[0]?.text;
  if (!fact) return [];
  // A negated, source-derived alternative allows incorrect teaching. Neither
  // the reaction model nor the learner receives an unselected alternative.
  const assertion = fact.replace(/[.!?。！？]+$/u, "");
  const choices = [
    { id: "teach_statement", text: fact },
    { id: "teach_alternative", text: `“${assertion}”라는 설명은 맞지 않다.` },
    { id: "teach_unknown", text: `${topic}에 대해서는 아직 잘 모르겠어요.` },
  ];
  // Rotate to avoid a UI that presents its first button as an answer key.
  const offset = [...topic].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % choices.length;
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}

export function parseTeachingChoices(raw: string | null | undefined): TeachingChoiceDto[] | undefined {
  if (!raw) return undefined;
  try { return TeachingChoicesSchema.parse(JSON.parse(raw)); } catch { return undefined; }
}

export function isUnknownTeaching(text: string): boolean {
  return /^[^.!?\n]+에 대해서는 아직 잘 모르겠어요[.!?]?$/u.test(text.trim())
    || /^(?:아직 |잘 )?모르겠(?:어요|습니다|어)[.!?]?$/u.test(text.trim());
}

/** A chosen proposition teaches its current topic even if the proposition is false. */
export function selectedTeachingObjective(input: Parameters<Llm["juniorTurn"]>[0]): string | undefined {
  if (input.persona !== "MALE_EASY" || isUnknownTeaching(input.explanation)) return undefined;
  const lastQuestion = [...input.history].reverse().find((message) => message.role === "JUNIOR" && message.stage === "QUESTION");
  const objective = matchQuestionObjective(input.objectives, lastQuestion?.content ?? "");
  if (!objective) return undefined;
  const topic = objectiveTopic(objective);
  const choices = teachingChoicesFor(input.chapter, topic);
  const statement = choices.find((choice) => choice.id === "teach_statement")?.text;
  // An unrelated fallback passage is still just user text for normal analysis;
  // choosing it must not grant mastery of the question's unrelated topic.
  return statement && supportsTopic(statement, topic) && choices.some((choice) => choice.text === input.explanation) ? objective.id : undefined;
}
