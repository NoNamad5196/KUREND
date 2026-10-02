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
  return /^(?:이 노트는|설명 연습에서는|별도 표시가 없으면|따라서 .+구분해야 한다)/u.test(text)
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
  return teachingFactsFor(chapter, topic, 1)[0];
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
    ["두 곡선 자체가 이동하지 않고 각 곡선 위의 점이 변한다", "두 곡선 자체가 오른쪽으로 이동하고 각 곡선 위의 점은 변하지 않는다", "두 곡선 자체가 왼쪽으로 이동하고 각 곡선 위의 점은 변하지 않는다", "한 곡선 자체만 이동하고 다른 곡선 위의 점은 변하지 않는다"],
    ["가격의 변화에 대해 수요량이나 공급량이 얼마나 민감하게 반응하는지", "수요량이나 공급량이 변해도 가격이 항상 동일하게 유지되는지", "가격의 절대 크기가 수요량이나 공급량의 합과 얼마나 비슷한지", "가격의 변화와 무관하게 수요량과 공급량이 항상 일치하는지"],
    ["각 가격에서 구입할 의사와 능력이 있는 수량의 관계", "특정 가격에서 실제 판매가 완료된 하나의 수량", "가격과 관계없이 소비자가 원한다고 응답한 수량", "소비자 소득과 기업의 생산량 사이의 관계"],
    ["한 소비자가 가격별로 구입하려는 수량", "모든 소비자가 서로 다른 가격에서 구입한 수량", "한 생산자가 가격별로 판매하려는 수량", "한 소비자가 가격과 무관하게 보유한 수량"],
    ["같은 가격에서 합한 관계", "서로 다른 가격에서 합한 관계", "같은 가격에서 평균한 관계", "가장 많은 소비자의 수량만 표시한 관계"],
    ["다수의 소비자와 생산자가 같은 재화를 거래하며", "한 명의 소비자와 생산자만 서로 다른 재화를 거래하며", "생산자만 참여하여 소비자의 선택 없이 가격을 정하며", "소비자만 참여하여 생산자의 공급 없이 재화를 나누며"],
    ["줄고", "늘고", "유지되고", "두 배가 되고"],
    ["늘고", "줄고", "유지되고", "절반이 되고"],
    ["줄어드는", "늘어나는", "일정하게 유지되는", "두 배로 증가하는"],
    ["늘어나는", "줄어드는", "일정하게 유지되는", "절반으로 감소하는"],
    ["감소하는", "증가하는", "일정하게 유지되는", "두 배로 커지는"],
    ["증가하는", "감소하는", "일정하게 유지되는", "절반으로 작아지는"],
    ["CPU만 받으면 실행할 수 있는", "입출력 완료를 기다리는", "이미 CPU를 사용해 실행 중인", "실행을 모두 마치고 종료한"],
    ["CPU 할당을 기다리는", "입출력 완료를 기다리는", "CPU를 사용해 실행 중인", "실행을 모두 마치고 종료한"],
    ["입출력 완료 같은 사건을 기다려 아직 실행할 수 없는", "CPU 할당만 기다려 바로 실행할 수 있는", "이미 CPU를 할당받아 명령을 실행하는", "모든 명령 실행을 마치고 자원을 반환한"],
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
  const topicAt = [`${topic}는 `, `${topic}은 `, `${topic}이란 `].some((subject) => fact.includes(subject)) ? fact.indexOf(topic) : -1;
  const group = groups.find(([needle]) => fact.includes(needle) && fact.indexOf(needle) >= topicAt);
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

/* ── 모범답안 선택지: 후배의 질문마다 자료에 근거한 답안 2개를 채팅 위에 제안한다(고르거나 직접 입력) ── */
export const MODEL_ANSWER_COUNT = 2;
const MODEL_ANSWER_MIN = 20;
const MODEL_ANSWER_MAX = 240;
const ANSWER_STOPWORDS = /^(?:그래서|그리고|그런데|그러면|이렇게|그렇게|때문에|때문이야|예를|들어|이것은|이건|그건|거야|이야|같아|있어|없어|돼|해|한다|된다|이다|말이야|쉽게|보면|즉|또|또한|먼저|그냥|정리하면|이걸|그걸|우리가|내가)$/u;

/** Ranked source assertions for a topic (most specific first), without directions or duplicates. */
export function teachingFactsFor(chapter: ChapterText, topic: string, limit = MODEL_ANSWER_COUNT): string[] {
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
    const definition = text.includes(`${topic}는 `) || text.includes(`${topic}은 `) || text.includes(`${topic}이란 `);
    return { text, index, score: matches * 10 + relationship + (text.includes(topic) ? 100 : 0) + (definition ? 100 : 0) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const out: string[] = [];
  for (const { text, score } of ranked) {
    if (out.some((seen) => seen.replace(/\s/gu, "") === text.replace(/\s/gu, ""))) continue;
    // 두 번째 이후 문장은 주제를 온전히 담은 것만(한 단어만 겹치는 다른 개념의 문장은 모범답안이 아니다).
    if (out.length > 0 && score < 100 && score < terms.length * 10) break;
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

export function modelAnswerChoices(answers: string[]): TeachingChoiceDto[] {
  return answers.map((text, index) => ({ id: `answer_${index + 1}`, text: cleanSourceSentence(text) })).filter((choice) => choice.text.length > 0);
}

/** Deterministic model answers straight from the source (offline, demo, or when the model's draft fails validation). */
export function modelAnswersFor(chapter: ChapterText, topic: string): TeachingChoiceDto[] {
  return modelAnswerChoices(teachingFactsFor(chapter, topic));
}

/** Share of content words of an answer that appear in the source (particles and verb endings tolerated). */
export function groundedInSource(answer: string, source: string): number {
  const tokens = (answer.match(/[가-힣A-Za-z0-9]{2,}/gu) ?? []).filter((token) => !ANSWER_STOPWORDS.test(token));
  if (!tokens.length) return 0;
  const compact = source.replace(/\s+/gu, "");
  const hits = tokens.filter((token) => [token, token.slice(0, -1), token.slice(0, -2)]
    .filter((candidate) => candidate.length >= 2)
    .some((candidate) => source.includes(candidate) || compact.includes(candidate))).length;
  return hits / tokens.length;
}

/** The model may only phrase what the source says: no new facts, no address, no markdown, on topic. */
export function modelAnswersSchema(chapter: ChapterText, topic: string) {
  const terms = topicTerms(topic);
  return z.object({ answers: z.array(z.string().trim().min(MODEL_ANSWER_MIN).max(MODEL_ANSWER_MAX)).min(1).max(MODEL_ANSWER_COUNT) })
    .superRefine(({ answers }, ctx) => {
      const compact = (text: string) => text.replace(/\s|[.!?]/gu, "");
      if (new Set(answers.map(compact)).size !== answers.length) ctx.addIssue({ code: "custom", message: "두 답안은 서로 달라야 합니다." });
      for (const [index, text] of answers.entries()) {
        if (META_CHOICE.test(text) || /\*\*|__|`|#|선배|후배님|[?？]\s*$/u.test(text)) {
          ctx.addIssue({ code: "custom", path: ["answers", index], message: "호칭·질문형·마크다운·메타 표현 없이 설명 문장만 쓰세요." });
        } else if (groundedInSource(text, chapter.text) < 0.5) {
          ctx.addIssue({ code: "custom", path: ["answers", index], message: "자료(source)에 있는 용어와 사실만으로 쓰세요." });
        } else if (terms.length && !terms.some((term) => text.includes(term)) && !text.includes(topic)) {
          ctx.addIssue({ code: "custom", path: ["answers", index], message: `${topic}에 대한 설명이어야 합니다.` });
        }
      }
    });
}
