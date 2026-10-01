import type { ChapterText } from "./types";

export const MAX_SOURCE_CHARACTERS = 40_000;
export const MAX_CHAPTER_CHARACTERS = 8_000;
/** 배우지 못한 문항의 답안(답안지 문체). 예전 대화체 문구도 같은 뜻으로 인식한다. */
export const UNLEARNED_ANSWER = "배우지 못한 내용이라 답을 쓸 수 없음.";
const LEGACY_UNLEARNED = ["이 부분은 선배한테 못 들어서 모르겠습니다.", "이 부분은 선배님께 못 들어서 모르겠습니다."];
export function isUnlearnedAnswer(answer: string): boolean {
  const body = answer.trim().replace(/^[①②③④]\s*/u, "");
  return body === UNLEARNED_ANSWER || LEGACY_UNLEARNED.includes(body);
}
/** 답안 어딘가에 미학습 표시가 들어 있는지(객관식 "② 배우지 못한…" 포함) */
export function containsUnlearnedAnswer(answer: string): boolean {
  return [UNLEARNED_ANSWER, ...LEGACY_UNLEARNED].some((marker) => answer.includes(marker));
}

/** 모델 출력에서 마크다운 강조·코드·제목 기호를 지운다. 사용자 원문 인용 검증에는 쓰지 않는다. */
export function plainText(text: string): string {
  return text.replace(/\*\*|__|`/gu, "").replace(/^\s*#{1,6}\s+/gmu, "").replace(/[ \t]{2,}/gu, " ").trim();
}

/* 답안지 문체: 선배의 반말·해요체 설명을 시험 답안처럼 "~다."로 끝맺는다(내용은 바꾸지 않고 문장 끝만). */
const VERB_ENDINGS: [RegExp, string][] = [
  [/라고 보면 돼$/u, "라고 볼 수 있다"], [/(?:것|거)이?야$/u, "것이다"],
  [/줄어$/u, "줄어든다"], [/늘어$/u, "늘어난다"], [/생겨$/u, "생긴다"], [/움직여$/u, "움직인다"], [/바뀌어$/u, "바뀐다"],
  [/달라$/u, "다르다"], [/커져$/u, "커진다"], [/작아져$/u, "작아진다"], [/내려가$/u, "내려간다"], [/올라가$/u, "올라간다"],
  [/져$/u, "진다"], [/돼$/u, "된다"], [/해$/u, "한다"], [/있어$/u, "있다"], [/없어$/u, "없다"], [/같아$/u, "같다"],
  [/많아$/u, "많다"], [/적어$/u, "적다"], [/높아$/u, "높다"], [/낮아$/u, "낮다"], [/몰라$/u, "모른다"], [/이야$/u, "이다"],
];
function formalSentence(sentence: string): string {
  const body = sentence.trim().replace(/[.!~…]+$/u, "");
  if (!body || /[?？]$/u.test(body) || /(다|음|함|됨|임)$/u.test(body)) return sentence.trim().replace(/[!~…]+$/u, ".");
  if (/(?:이)?에요$|예요$/u.test(body)) return `${body.replace(/(?:이)?에요$|예요$/u, "이다")}.`;
  const base = body.replace(/요$/u, "");
  const rule = VERB_ENDINGS.find(([pattern]) => pattern.test(base));
  return `${rule ? base.replace(rule[0], rule[1]) : base}.`;
}
/** 여러 문장을 각각 "~다."로 맞춘다. 끝이 이미 평서형이면 그대로. */
export function answerStyle(text: string): string {
  return (text.match(/[^.!?。！？~…]+(?:[.!?。！？~…]+|$)/gu) ?? [text]).map(formalSentence).filter(Boolean).join(" ");
}
/** 답안 문장이 시험 답안 문체(평서형 ~다/~음)로 끝나는지 */
export function isAnswerStyle(text: string): boolean {
  return /(다|음|함|됨|임)\s*[.。]?\s*$/u.test(text.trim());
}

/** 시험지 문항 문체: 호칭으로 시작하지 않고, 해요체·반말 의문으로 끝나지 않는다. */
export function examQuestionText(text: string): string {
  return plainText(text)
    .replace(/^(?:선배님?|후배님?)\s*[,，!]?\s*/u, "")
    // "설명하세요." "고르세요." 같은 안내형 존댓말은 시험지 문체(~시오)로 맞춘다.
    .replace(/세요(?=[.!]|\s*$)/gu, "시오")
    .replace(/시오!/gu, "시오.");
}
export function isConversationalQuestion(text: string): boolean {
  return /선배/u.test(text) || /(?:요|까|니|어|야|지|래|죠|자)\s*[?？.!~…]*\s*$/u.test(text);
}

export type SourceParagraph = {
  index: number;
  sourceId: string;
  startOffset: number;
  endOffset: number;
  text: string;
};

/** UTF-16 offsets are retained because Source.text.slice uses the same units. */
function safeEnd(text: string, end: number): number {
  const last = text.charCodeAt(end - 1);
  return end < text.length && last >= 0xd800 && last <= 0xdbff ? end - 1 : end;
}

export function compactText(text: string, limit = MAX_CHAPTER_CHARACTERS): string {
  limit = Math.max(0, Math.floor(limit));
  if (text.length <= limit) return text;
  const marker = "\n…중간 생략…\n";
  if (limit <= marker.length) return text.slice(0, safeEnd(text, Math.max(0, limit)));
  const head = safeEnd(text, Math.floor((limit - marker.length) / 2));
  let tailStart = text.length - (limit - marker.length - head);
  const first = text.charCodeAt(tailStart);
  if (first >= 0xdc00 && first <= 0xdfff) tailStart += 1;
  return text.slice(0, head) + marker + text.slice(tailStart);
}

export function compactChapter(chapter: ChapterText): ChapterText {
  return { title: chapter.title, points: [...chapter.points], text: compactText(chapter.text) };
}

/** Every displayed paragraph belongs to exactly one source; delimiters remain in its range. */
export function paragraphizeSources(sources: { sourceId: string; text: string }[]) {
  if (!sources.length || sources.length > 12) throw new Error("목차를 만들 자료가 필요합니다.");
  if (new Set(sources.map((source) => source.sourceId)).size !== sources.length) {
    throw new Error("자료 ID가 중복되었습니다.");
  }
  const paragraphs: SourceParagraph[] = [];
  let remaining = MAX_SOURCE_CHARACTERS;
  const displayed = sources.map((source, sourceIndex) => {
    if (!source.sourceId || !source.text.trim()) throw new Error("빈 자료로는 목차를 만들 수 없습니다.");
    // Share the input budget so a large first upload cannot hide later uploads.
    const budget = Math.floor(remaining / (sources.length - sourceIndex));
    const length = safeEnd(source.text, Math.min(source.text.length, budget));
    const text = source.text.slice(0, length);
    if (!text.trim()) throw new Error("자료 앞부분에서 읽을 수 있는 텍스트를 찾지 못했습니다.");
    if (text.length < 300) throw new Error("목차를 만들려면 각 자료가 최소 300자여야 합니다.");
    remaining -= length;
    const ranges: { start: number; end: number }[] = [];
    let start = 0;
    for (const match of text.matchAll(/\r?\n[ \t]*(?:\r?\n)+/g)) {
      const end = match.index! + match[0].length;
      if (text.slice(start, end).trim()) {
        ranges.push({ start, end });
        start = end;
      }
    }
    if (start < text.length) {
      if (text.slice(start).trim() || !ranges.length) ranges.push({ start, end: text.length });
      else ranges[ranges.length - 1].end = text.length;
    }
    // Oversized paragraphs are split only by the server, never by model offsets.
    const maxParagraph = Math.max(300, Math.min(1_000, Math.floor(text.length / 4)));
    const local: SourceParagraph[] = [];
    for (const range of ranges) {
      let cursor = range.start;
      while (cursor < range.end) {
        let end = Math.min(cursor + maxParagraph, range.end);
        if (end < range.end && maxParagraph > 600) {
          const candidate = text.slice(cursor, end).search(/\s+\S*$/);
          if (candidate >= Math.floor(maxParagraph / 2)) end = cursor + candidate + 1;
        }
        end = safeEnd(text, end);
        const paragraph = {
          index: paragraphs.length, sourceId: source.sourceId,
          startOffset: cursor, endOffset: end, text: text.slice(cursor, end),
        };
        paragraphs.push(paragraph);
        local.push(paragraph);
        cursor = end;
      }
    }
    return { sourceId: source.sourceId, truncated: length < source.text.length, length, paragraphs: local };
  });
  const totalLength = displayed.reduce((total, source) => total + source.length, 0);
  if (totalLength < 1_200) throw new Error("300자 이상의 목차 4개를 만들려면 자료가 합계 1,200자 이상이어야 합니다.");
  const possibleChapters = displayed.reduce((total, source) => {
    let count = 0;
    let length = 0;
    for (const paragraph of source.paragraphs) {
      length += paragraph.text.length;
      if (length >= 300) { count += 1; length = 0; }
    }
    return total + count;
  }, 0);
  if (possibleChapters < 4) throw new Error("원본 자료의 경계를 유지하면서 300자 이상의 목차 4개로 나누기에는 자료가 짧습니다.");
  const minChapters = 4;
  return { sources: displayed, paragraphs, minChapters, maxChapters: 12 };
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function rubricElements(rubric: string): string[] {
  return rubric.split(";").map((element) => element.trim()).filter(Boolean);
}
