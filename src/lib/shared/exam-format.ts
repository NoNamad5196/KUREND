import { stripMarkdownBold } from "./plain-text";

const CHOICE_MARKS = ["①", "②", "③", "④"] as const;

/** Accept current exam-sheet numbers and previously saved circled choices. */
export function examChoiceIndex(answer: string): number {
  const text = stripMarkdownBold(answer).trim();
  const mark = CHOICE_MARKS.findIndex((choice) => text.startsWith(choice));
  if (mark >= 0) return mark;
  const digit = /^\(?([1-4])(?:번|[).]|$)/u.exec(text)?.[1];
  return digit ? Number(digit) - 1 : -1;
}

export function formatExamChoice(answer: string): string {
  const index = examChoiceIndex(answer);
  return index < 0 ? answer : `${index + 1}번`;
}

/** Presentation only: this never rewrites source passages or citation evidence. */
export function formatExamQuestion(question: string): string {
  return stripMarkdownBold(question).trim()
    .replace(/^\s*(?:\d+[.)]\s*)?(?:선배님?|선생님)[,~!！\s]+/u, "")
    .replace(/(?:알려|설명해)\s*주(?:실래요|시겠어요|실 수 있나요)[.!?？]?$/u, "설명하시오.")
    .replace(/(?:설명|서술|비교|구분|선택|분석|제시|기술|계산)하세요[.!?？]?$/u, (ending) => ending.replace(/하세요[.!?？]?$/u, "하시오."))
    .replace(/고르세요[.!?？]?$/u, "고르시오.")
    .replace(/무엇인가요[.!?？]?$/u, "무엇인지 설명하시오.")
    .replace(/어떻게 되나요[.!?？]?$/u, "어떻게 되는지 설명하시오.")
    .replace(/인가요[.!?？]?$/u, "인지 설명하시오.");
}

export function isFormalExamQuestion(question: string): boolean {
  return !/선배님?|선생님|안녕하세요|해주실래|해 주실래|인가요|같아요|감사합니다|제 생각/u.test(question)
    && /(?:하시오|고르시오|쓰시오|구하시오)[.!?]?$/u.test(question.trim());
}
