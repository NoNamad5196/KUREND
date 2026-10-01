/** 공급자 선택과 지연 생성되는 llm 싱글턴. 전송 계층은 ./transport (기존 import 경로 호환을 위해 재수출). */
import type { Llm } from "./types";
import { createLiveLlm } from "./live";
import { stubLlm } from "./stub";
import { providerName } from "./transport";

export * from "./transport";

// Resolve lazily: builds and stub demos never require real provider credentials.
let live: Llm | undefined;
function implementation(): Llm {
  return providerName() === "stub" ? stubLlm : (live ??= createLiveLlm());
}
export const llm: Llm = {
  generateChapters: input => implementation().generateChapters(input),
  generateTeacherNote: input => implementation().generateTeacherNote(input),
  prepareSession: input => implementation().prepareSession(input),
  juniorTurn: input => implementation().juniorTurn(input),
  writeExamAnswer: input => implementation().writeExamAnswer(input),
  gradeExam: input => implementation().gradeExam(input),
  tutorExplain: input => implementation().tutorExplain(input),
};
