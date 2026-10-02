/**
 * 후배 질문 위에 보여 주는 힌트의 종류. 선택지 id 접두어로 구분한다(DB 스키마 변경 없음).
 * - answers: 모범답안 2개(체험 계정) — 고르면 그대로 설명으로 전송
 * - keywords: 모범 키워드 3개(실제 계정) — 누르면 입력창에 추가, 설명은 직접 쓴다
 */
export type TeachingHintMode = "answers" | "keywords";

export const ANSWER_CHOICE_PREFIX = "answer_";
export const KEYWORD_CHOICE_PREFIX = "keyword_";

export function teachingChoiceKind(choices: { id: string }[] | undefined): TeachingHintMode {
  return choices?.length && choices.every((choice) => choice.id.startsWith(KEYWORD_CHOICE_PREFIX)) ? "keywords" : "answers";
}
