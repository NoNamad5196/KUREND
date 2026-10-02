import type { TeachingHintMode } from "@/lib/shared/teaching-hints";

/** 체험 계정. 운영에서는 시연용 한 계정(체험 1)만 열고, 나머지는 개발·테스트 전용이다. */
export const DEMO_USER_IDS = ["usr_demo1", "usr_demo2", "usr_demo3"];
/** 로그인 화면의 "체험 계정으로 둘러보기" 가 쓰는 계정. 시드가 샘플 자료·세션을 함께 만든다. */
export const PUBLIC_DEMO_USER_ID = "usr_demo1";
export const PUBLIC_DEMO_NICKNAME = "체험 1";

/** 개발·테스트에서만 체험 계정 세 개와 목업 인증을 모두 연다. */
export function demoAuthEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

/** 지금 환경에서 체험 로그인이 허용되는 계정 — 운영은 공개 체험 계정 하나뿐 */
export function allowedDemoUserIds(): string[] {
  return demoAuthEnabled() ? DEMO_USER_IDS : [PUBLIC_DEMO_USER_ID];
}

export function isDemoUserId(userId: string): boolean {
  return allowedDemoUserIds().includes(userId);
}

/** 후배 질문 위 힌트: 체험 계정은 모범답안 2개(골라서 전송), 구글 로그인 실제 계정은 모범 키워드 3개(설명은 직접 작성) */
export function teachingHintModeFor(userId: string): TeachingHintMode {
  return isDemoUserId(userId) ? "answers" : "keywords";
}
