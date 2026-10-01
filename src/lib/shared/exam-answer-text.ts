import { stripMarkdownBold } from "@/lib/shared/plain-text";

// Presentation only. Keep the original quote/ref for evidence validation; this
// deliberately cannot rewrite arbitrary Korean or add missing subject matter.
const ENDINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/것 같(?:습니다|아요|아)$/u, "것으로 보인다"],
  [/듯(?:합니다|해요|해)$/u, "듯하다"],
  // Explicit formal endings only; a general 습니다 rewrite would corrupt
  // irregular predicates and could change modal/uncertain statements.
  [/입니다$/u, "이다"],
  [/아닙니다$/u, "아니다"],
  [/있습니다$/u, "있다"],
  [/없습니다$/u, "없다"],
  [/됩니다$/u, "된다"],
  [/((?:필요|중요|가능|불가능|명확|동일|일정|충분|유사|복잡|간단|유효|정확))합니다$/u, "$1하다"],
  [/합니다$/u, "한다"],
  [/수도 있(?:어요|어)$/u, "수도 있다"],
  [/야 (?:해요|해)$/u, "야 한다"],
  [/거(?:예요|야)$/u, "것이다"],
  [/아니(?:에요|야)$/u, "아니다"],
  [/이에요$/u, "이다"],
  [/예요$/u, "다"],
  [/이야$/u, "이다"],
  // A bare 야 can be part of a noun (분야, 시야), so restrict that case.
  [/((?:관계|전체|상태|변화|경우|이유|결과|차이|원리|예외|방법|개|양))야$/u, "$1다"],
  [/줄어들(?:어요|어)$/u, "줄어든다"],
  [/늘어나(?:요)?$/u, "늘어난다"],
  [/줄어(?:요)?$/u, "줄어든다"],
  [/늘어(?:요)?$/u, "늘어난다"],
  [/기다려(?:요)?$/u, "기다린다"],
  [/움직여(?:요)?$/u, "움직인다"],
  [/바뀌어(?:요)?$/u, "바뀐다"],
  [/달라져(?:요)?$/u, "달라진다"],
  [/올라(?:요)?$/u, "오른다"],
  [/내려(?:요)?$/u, "내린다"],
  [/있(?:어요|어)$/u, "있다"],
  [/없(?:어요|어)$/u, "없다"],
  [/않(?:아요|아)$/u, "않는다"],
  [/돼(?:요)?$/u, "된다"],
  // Restrict 해 to known predicates; otherwise nouns such as 피해/이해 break.
  [/((?:이동|변화|증가|감소|공유|설명|발생|의미|판단|선택|처리|유지|결정|작동))해(?:요)?$/u, "$1한다"],
  [/((?:필요|중요|가능|불가능|명확|동일|일정|충분|유사|복잡|간단))해(?:요)?$/u, "$1하다"],
];

function plainSentence(input: string): string {
  let text = input.trim();
  // Only complete greetings/reactions and punctuated vocatives are removable.
  // 선배의 역할 / 네 가지 / 제 생각에는 ... 같아 remain factual/uncertain.
  text = text.replace(/^(?:(?:안녕하세요|감사합니다)[.!！]\s*|(?:네|응|음|아)[,，!！]\s*|(?:선배님|선배)[,，:!！]\s*)+/u, "");
  text = text.replace(/^제 생각에는\s*[,，]?\s*/u, "");
  text = text.replace(/[,，]\s*(?:선배님|선배)([.!?。！？]*)$/u, "$1");
  const wrapped = /^(?:“([\s\S]+)”|"([\s\S]+)"|‘([\s\S]+)’|'([\s\S]+)')\s*(?:이라고|라고)\s*(?:배웠습니다|들었습니다|알고 있습니다)[.!。]*$/u.exec(text);
  if (wrapped) text = (wrapped[1] ?? wrapped[2] ?? wrapped[3] ?? wrapped[4]).trim();
  if (!text) return "";
  const punctuation = text.match(/[.!?。！？]+$/u)?.[0] ?? "";
  const body = punctuation ? text.slice(0, -punctuation.length).trimEnd() : text;
  // Do not change questions/exclamations into factual assertions.
  if (/[?？]/u.test(punctuation)) return text;
  for (const [ending, replacement] of ENDINGS) {
    if (ending.test(body)) return `${body.replace(ending, replacement)}.`;
  }
  return text;
}

function plainProse(text: string): string {
  text = text.trim();
  // Legacy answers can contain several wrapped quotes, each with several
  // sentences. Only unwrap when the entire answer consists of those wrappers.
  const wrapper = /(?:“([^”]+)”|"([^"]+)")\s*(?:이라고|라고)\s*(?:배웠습니다|들었습니다|알고 있습니다)[.!。]*/gu;
  const wrapped = Array.from(text.matchAll(wrapper));
  const content = wrapped.length && !text.replace(wrapper, "").trim()
    ? wrapped.map((match) => match[1] ?? match[2]).join(" ") : text;
  return content.split(/(?<=[.!?。！？])\s+|\n+/u).map(plainSentence).filter(Boolean).join(" ");
}

/** Code and mathematics are literal evidence, not prose to conjugate or reflow. */
function literalEnd(text: string, index: number): number | undefined {
  const rest = text.slice(index);
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  if (index === lineStart) {
    const fence = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/u.exec(rest);
    if (fence) {
      const mark = fence[1];
      const close = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}[\\t ]*(?:\\r?\\n|$)`, "gm");
      close.lastIndex = index + fence[0].length;
      const match = close.exec(text);
      return match ? match.index + match[0].length : text.length;
    }
    if (/^(?: {4}|\t)/u.test(rest)) {
      const newline = text.indexOf("\n", index);
      return newline < 0 ? text.length : newline + 1;
    }
  }
  const ticks = /^`+/u.exec(rest)?.[0];
  const math = rest.startsWith("\\(") ? ["\\(", "\\)"] : rest.startsWith("\\[") ? ["\\[", "\\]"]
    : rest.startsWith("$$") ? ["$$", "$$"] : rest.startsWith("$") ? ["$", "$"] : undefined;
  const opening = ticks ?? math?.[0];
  const closing = ticks ?? math?.[1];
  if (!opening || !closing) return undefined;
  const end = text.indexOf(closing, index + opening.length);
  // An unfinished code span is literal too; a lone currency sign is prose.
  return end >= 0 ? end + closing.length : ticks ? text.length : undefined;
}

export function plainExamAnswer(quote: string): string {
  const text = stripMarkdownBold(quote);
  let output = ""; let start = 0; let protectedAny = false;
  const prose = (chunk: string) => {
    if (!chunk.trim()) return chunk;
    return `${chunk.match(/^\s*/u)?.[0] ?? ""}${plainProse(chunk)}${chunk.match(/\s*$/u)?.[0] ?? ""}`;
  };
  for (let index = 0; index < text.length;) {
    const end = literalEnd(text, index);
    if (end === undefined) { index += 1; continue; }
    protectedAny = true;
    output += prose(text.slice(start, index)) + text.slice(index, end);
    start = end; index = end;
  }
  return protectedAny ? output + prose(text.slice(start)) : plainProse(text);
}

export const formatExamAnswer = plainExamAnswer;
