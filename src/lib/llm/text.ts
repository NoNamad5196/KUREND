import type { ChapterText } from "./types";

export const MAX_SOURCE_CHARACTERS = 40_000;
export const MAX_CHAPTER_CHARACTERS = 8_000;
export const UNLEARNED_ANSWER = "이 부분은 선배한테 못 들어서 모르겠습니다.";

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
