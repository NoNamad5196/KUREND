import type { ChapterText } from "./types";

export type SourceLearningConcept = { topic: string; sourceQuote: string };
const compact = (text: string) => text.replace(/[\s*_`]/gu, "").toLocaleLowerCase();
const cleanTopic = (text: string) => text.replace(/[*_`]/gu, "").replace(/\s+/gu, " ").trim();
function isDirection(text: string): boolean {
  return /^(?:별도 표시가 없으면|따라서 .+구분해야 한다)/u.test(text) || /(?:학습|설명|수업|교육)\s*목표|(?:이|본)\s*(?:자료|노트|문서|강의노트)|(?:이|본)\s*(?:장|절|단원).{0,45}(?:목표|목적|작성|다룬다|소개|익히|설명한다|집중한다)|설명 연습|시험 직전/u.test(text);
}
function validTopic(topic: string): boolean {
  return topic.length >= 2 && topic.length <= 55 && !isDirection(topic)
    && topic.split(/\s+/u).length <= 5 && !/(?:하려|이다|싶다|한다|하는|있는|없는)$/u.test(topic)
    && !/^(?:이것|그것|이는|이는 것|핵심|내용|개념|방향|여기서|따라서|반면|실제로|예를 들어|이 자료|이 노트|수업에서|다음|첫째|둘째)(?:\s|$)/u.test(topic)
    && !/^(?:핵심\s*)?(?:내용|개념|학습\s*목표)(?:\s*\d+)?$/u.test(topic);
}
function preferredScore(topic: string, quote: string): number {
  const target = compact(topic); const source = compact(quote);
  const at = source.indexOf(target);
  if (at >= 0 && (!source[at + target.length] || /[은는이가을를의다,.!?]/u.test(source[at + target.length]))) return 100;
  const tokens = (topic.match(/[가-힣A-Za-z0-9]{2,}/gu) ?? [])
    .map((token) => token.replace(/(?:의|과|와|을|를|은|는)$/u, ""))
    .filter((token) => token.length >= 2);
  if (!tokens.length) return 0;
  if (tokens.every((token) => source.includes(compact(token)))) return 70;
  // Generic cause/condition labels may be absent from their substantive list.
  // Require the named subject plus a relationship and a list of conditions.
  if (/요인|원인|조건/u.test(topic)) {
    const anchors = tokens.filter((token) => !/요인|원인|조건/u.test(token));
    if (anchors.length && anchors.every((token) => source.includes(compact(token)))
      && /[,·]/u.test(quote) && /(?:때|면|따라|영향|조건|때문)/u.test(quote)) return 40 + Math.min(5, (quote.match(/[,·]/gu) ?? []).length);
  }
  return 0;
}

/** Select only source-backed concepts. Insufficient material is an error, never
 * an invitation to repeat a topic or fabricate a generic fifth objective. */
export function sourceLearningConcepts(chapter: ChapterText, count: number, preferredTopics: string[] = []): SourceLearningConcept[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("학습 개념 수는 양의 정수여야 합니다.");
  const rawSentences = Array.from(chapter.text.matchAll(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu));
  const sentences = rawSentences.map((match) => match[0].trim())
    .filter((quote) => quote.length >= 18 && quote.length <= 1200 && !/^\s*(?:#|\|)/u.test(quote) && !isDirection(quote));
  const adjoining = rawSentences.slice(1).map((match, index) => chapter.text.slice(rawSentences[index].index!, match.index! + match[0].length).trim())
    .filter((quote) => quote.length >= 18 && quote.length <= 600 && !/[#|]/u.test(quote) && !isDirection(quote));
  const preferredEvidence = [...sentences, ...adjoining];
  const result: SourceLearningConcept[] = [];
  const seen = new Set<string>();
  const add = (topic: string, sourceQuote: string) => {
    topic = cleanTopic(topic);
    if (result.length >= count || !validTopic(topic) || seen.has(compact(topic)) || !chapter.text.includes(sourceQuote)) return;
    seen.add(compact(topic)); result.push({ topic, sourceQuote });
  };
  for (const topic of preferredTopics.length ? preferredTopics : chapter.points) {
    const ranked = preferredEvidence.map((sourceQuote, index) => ({ sourceQuote, index, score: preferredScore(topic, sourceQuote) }))
      .filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
    if (ranked[0]) add(topic, ranked[0].sourceQuote);
  }
  const subjectCandidates: Array<SourceLearningConcept & { priority: number }> = [];
  for (const sourceQuote of sentences) {
    const cleaned = sourceQuote.replace(/^\s*(?:[-*+•▪◦]|\d+[.)])\s+/u, "");
    for (const subject of cleaned.matchAll(/(?:^|,\s*)([^,]{2,55}?)(?:이란|란|은|는)\s/gu)) {
      if (subject.index! > 0 && /(?:면|때|고|서)\s/u.test(subject[1])) continue;
      subjectCandidates.push({ topic: subject[1].replace(/에서$/u, ""), sourceQuote,
        priority: /(?:관계|수량|상태|일|방식|정책|집합|과정|방법|비율|시간|재화|개념|구성 요소)(?:이)?다[.!]?$/u.test(sourceQuote) ? 1 : 0 });
    }
  }
  for (const { topic, sourceQuote } of subjectCandidates.sort((a, b) => b.priority - a.priority)) add(topic, sourceQuote);
  // A heading is useful only when nearby content actually names its topic.
  for (const heading of chapter.text.matchAll(/^#{2,6}\s+(?:\d+[.)]\s*)?(.+)$/gmu)) {
    const topic = cleanTopic(heading[1]);
    const nearby = sentences.find((quote) => chapter.text.indexOf(quote) > heading.index! && preferredScore(topic, quote) >= 70);
    if (nearby) add(topic, nearby);
  }
  if (result.length < count) throw new Error(`자료에서 서로 다른 학습 개념 ${count}개를 확인하지 못했습니다. (확인: ${result.length}개)`);
  return result;
}
