import { z } from "zod";
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
  return /^(?:이 노트는|설명 연습에서는|별도 표시가 없으면)/u.test(text)
    || /(?:학습|설명|수업|교육)\s*목표/u.test(text)
    || /(?:이|본)\s*(?:자료|문서|강의노트|장|절|단원|수업).{0,35}(?:목표|목적|다룬다|다룹니다|살펴본다|알아본다|소개한다|익히기|작성한)/u.test(text);
}

function supportsTopic(statement: string, topic: string): boolean {
  if (isMaterialDirection(statement)) return false;
  if (statement.includes(topic)) return true;
  const terms = topicTerms(topic);
  return terms.length > 0 && terms.every((term) => statement.includes(term));
}

/** Markdown list/quote markers and emphasis are layout, not part of what the learner says. */
export function cleanSourceSentence(text: string): string {
  return text
    .replace(/^\s*(?:>\s*)*(?:[-*+•▪◦]|\d{1,2}[)]|[①-⑳])\s+/u, "")
    .replace(/\*\*|__|`/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Pick an actual assertion from the source, never material directions or an answer key. */
export function teachingFactFor(chapter: ChapterText, topic: string): string | undefined {
  const terms = topicTerms(topic);
  const raw = (chapter.text.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu) ?? [])
    .filter((text) => !/^\s*(?:#|\|)/u.test(text))
    .map(cleanSourceSentence);
  const sentences = raw.map((text, index) => /^(?:이는|이것이|이것은) /u.test(text) && index > 0 ? `${raw[index - 1]} ${text}` : text)
    .filter((text) => text.length > 12 && text.length <= 200 && !isMaterialDirection(text));
  const ranked = sentences.map((text, index) => {
    const matches = terms.filter((term) => text.includes(term)).length;
    const relationship = matches > 0 && /요인|원인|조건/u.test(topic)
      ? Math.min(3, (text.match(/[,·]/gu) ?? []).length) + Number(/때|면|따라|때문|영향|조건/u.test(text)) : 0;
    return { text, index, score: matches * 10 + relationship + (text.includes(topic) ? 100 : 0) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.text;
}

export const META_CHOICE = /(?:맞지|옳지)\s*않|(?:설명|문장|내용|주장|보기).{0,8}(?:맞지|옳지|틀렸|관계없)|(?:아직|잘)\s*모르|정답|오답|(?:^|\s)위의\s*(?:보기|설명|모든)|위 설명|모두 맞|해당 없|선배|\*\*/u;

/** A source sentence is the sole correct option; the model only authors three misconceptions. */
export function teachingDistractorsSchema(statement: string, topic: string) {
  return z.object({ distractors: z.array(z.string().trim().min(8).max(200)).length(3) }).superRefine(({ distractors }, ctx) => {
    const texts = [statement, ...distractors];
    const compact = (text: string) => text.replace(/\s|[.!?]/gu, "");
    if (new Set(texts.map(compact)).size !== 4) ctx.addIssue({ code: "custom", message: "보기 네 개는 서로 달라야 합니다." });
    const terms = topicTerms(topic).filter((term) => statement.includes(term));
    for (const [index, text] of distractors.entries()) {
      if (META_CHOICE.test(text) || text.length < statement.length * 0.6 || text.length > statement.length * 1.6
        || (terms.length > 0 && !terms.some((term) => text.includes(term)))) {
        ctx.addIssue({ code: "custom", path: ["distractors", index], message: "같은 개념의 구체적인 오개념 문장을 비슷한 길이와 구조로 작성하세요. 메타 부정·모르겠음·다른 주제는 금지합니다." });
      }
    }
  });
}

export function teachingChoicesFrom(statement: string, distractors: string[], topic: string): TeachingChoiceDto[] {
  const choices = [statement, ...distractors].map((text, index) => ({
    id: index === 0 ? "teach_statement" : index === 1 ? "teach_alternative" : `teach_alternative_${index}`, text,
  }));
  const offset = [...topic].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % choices.length;
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}

/** Deterministic source-derived misconceptions for offline/demo use. Unknown is a free-text response, never a distractor. */
export function teachingChoicesFor(chapter: ChapterText, topic: string): TeachingChoiceDto[] {
  const fact = teachingFactFor(chapter, topic);
  if (!fact) return [];
  // Change the learned relation, retaining the source's subject, grammar and specificity.
  const groups = [
    ["줄고", "늘고", "유지되고", "두 배가 되고"],
    ["늘고", "줄고", "유지되고", "절반이 되고"],
    ["줄어드는", "늘어나는", "일정하게 유지되는", "두 배로 증가하는"],
    ["늘어나는", "줄어드는", "일정하게 유지되는", "절반으로 감소하는"],
    ["감소하는", "증가하는", "일정하게 유지되는", "두 배로 커지는"],
    ["증가하는", "감소하는", "일정하게 유지되는", "절반으로 작아지는"],
    ["CPU만 받으면 실행할 수 있는", "입출력 완료를 기다리는", "이미 CPU를 사용해 실행 중인", "실행을 모두 마치고 종료한"],
    ["CPU 할당을 기다리는", "입출력 완료를 기다리는", "CPU를 사용해 실행 중인", "실행을 모두 마치고 종료한"],
    ["CPU를 회수할 수 있다", "프로세스 종료 때만 CPU를 회수한다", "입출력 요청 때만 CPU를 회수한다", "프로세스가 반환할 때만 CPU를 회수한다"],
    ["독립적인 주소 공간", "모든 프로세스가 공유하는 주소 공간", "부모 프로세스와 동일한 주소 공간", "실행 스레드마다 별도인 주소 공간"],
    ["준비, 실행, 대기", "생성, 종료, 대기", "준비, 실행, 종료", "생성, 실행, 종료"],
    ["종료되거나 스스로 대기 상태로 들어갈 때까지", "더 높은 우선순위의 작업으로 교체될 때까지", "타이머 인터럽트로 실행권을 반환할 때까지", "새 작업의 도착으로 실행을 멈출 때까지"],
    ["준비 큐에 있는 프로세스", "입출력 완료를 기다리는 프로세스", "실행을 마치고 종료된 프로세스", "이미 CPU를 사용 중인 프로세스"],
    ["공짜가 아니다", "사용자 계산을 직접 늘린다", "CPU 이용률을 항상 높인다", "추가 실행 시간 없이 끝난다"],
    ["실행 대상을 결정하고", "실제 문맥 전환을 수행하고", "입출력 완료를 기다리고", "종료된 프로세스를 정리하고"],
    ["소득, 기호", "자체 가격, 기호", "자체 가격, 생산비", "생산비, 판매자 수"],
    ["동일한 곡선의 다른 점으로", "수요곡선 전체가 오른쪽으로", "수요곡선 전체가 왼쪽으로", "수요곡선의 기울기가 바뀌며"],
    ["특정 가격에 대응하는 하나의 수량", "모든 가격과 수량을 함께 나타낸 관계", "실제로 판매를 완료한 누적 수량", "소비자 소득과 구입량을 나타낸 관계"],
    ["수요곡선 위의 이동", "수요곡선 전체의 오른쪽 이동", "수요곡선 전체의 왼쪽 이동", "공급곡선 전체의 오른쪽 이동"],
    ["수요곡선 위의 한 점에서 다른 점으로", "수요곡선 전체를 오른쪽으로", "수요곡선 전체를 왼쪽으로", "공급곡선 전체를 오른쪽으로"],
    ["한 점에서 다른 점으로", "오른쪽으로 곡선 전체를", "왼쪽으로 곡선 전체를", "기울기를 바꾸며 곡선 전체를"],
  ];
  const group = groups.find(([needle]) => fact.includes(needle));
  if (!group) return [];
  const distractors = group.slice(1).map((replacement) => fact.replace(group[0], replacement));
  const checked = teachingDistractorsSchema(fact, topic).safeParse({ distractors });
  return checked.success ? teachingChoicesFrom(fact, checked.data.distractors, topic) : [];
}

/** A substantive statement can explain the current topic even when its facts are wrong. */
export function explainedQuestionObjective(input: Parameters<Llm["juniorTurn"]>[0]): string | undefined {
  if (!input.persona || input.persona === "KU_HARD" || isUnknownTeaching(input.explanation)) return undefined;
  const lastQuestion = [...input.history].reverse().find((message) => message.role === "JUNIOR" && message.stage === "QUESTION");
  const objective = matchQuestionObjective(input.objectives, lastQuestion?.content ?? "");
  if (!objective || input.explanation.trim().length < 12 || /[?？]\s*$/u.test(input.explanation)) return undefined;
  const topic = objectiveTopic(objective);
  const options = lastQuestion?.teachingChoices ?? teachingChoicesFor(input.chapter, topic);
  if (options.some((choice) => cleanSourceSentence(choice.text) === cleanSourceSentence(input.explanation))) return objective.id;
  return supportsTopic(input.explanation, topic) && /은|는|이란|이다|상태|때문|하면|한다|해요|이야|야[.!]?$/u.test(input.explanation) ? objective.id : undefined;
}

export function parseTeachingChoices(raw: string | null | undefined): TeachingChoiceDto[] | undefined {
  if (!raw) return undefined;
  try { return TeachingChoicesSchema.parse(JSON.parse(raw)); } catch { return undefined; }
}

export function isUnknownTeaching(text: string): boolean {
  return /^[^.!?\n]+에 대해서는 아직 잘 모르겠어요[.!?]?$/u.test(text.trim())
    || /^(?:아직 |잘 )?모르겠(?:어요|습니다|어)[.!?]?$/u.test(text.trim());
}

/** A selected proposition is an explanation, not a correctness judgement. */
export function selectedTeachingObjective(input: Parameters<Llm["juniorTurn"]>[0]): string | undefined {
  return input.persona === "MALE_EASY" ? explainedQuestionObjective(input) : undefined;
}
