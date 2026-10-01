/**
 * [FROZEN] SSE 이벤트 타입. 설계서 §6 그대로.
 * 와이어 포맷: text/event-stream; 첫 줄 ": connected", 이벤트는 "event: <name>\ndata: <JSON>\n\n",
 * 15초마다 ": ping", 오류는 event: error 후 종료, 마지막은 항상 event: done.
 */
import type { FinalVerdict, GapDto, GradeVerdict, RecallLevel, SessionDto } from "./types";

export type SseEvent =
  // 6-1 목차 생성 /materials/{id}/generate
  | { event: "progress"; data: { step: "READING" | "SPLITTING" | "TITLING" | "OBJECTIVES" | "QUESTIONS" | "GREETING"; message: string; elapsedMs: number } }
  | { event: "chapters"; data: { title: string; chapters: Array<{ chapterId: string; order: number; title: string; points: string[] }> } }
  // 6-2 세션 준비 /sessions/{id}/prepare
  | { event: "ready"; data: { session: SessionDto } }
  // 6-3 가르치기 /sessions/{id}/explanations
  | { event: "user.saved"; data: { messageId: string } }
  | { event: "junior.concepts"; data: { heardConcepts: string[]; added: string[] } }
  | { event: "junior.doubt"; data: { messageId: string; content: string } } // ★ 되묻기. 이 턴은 여기서 종료(question 없음)
  | { event: "junior.token"; data: { token: string } } // 문장 단위
  | { event: "junior.message"; data: { messageId: string; stage: "REACTION"; content: string } }
  | { event: "junior.question"; data: { messageId: string; content: string; coveredObjectives: string[] } }
  // 6-4 시험 답안 /sessions/{id}/exam/answers
  | { event: "answer.sources"; data: { qid: string; sources: Array<{ ref: number; content: string }> } } // ref = USER 메시지 순번(1-base)
  | { event: "answer.thought"; data: { qid: string; token: string; closed: boolean } } // 글자 단위 속마음
  | { event: "answer.token"; data: { qid: string; token: string } } // 문장 단위
  | { event: "answer.recall"; data: { qid: string; ref: number | null; level: RecallLevel; unlearned: boolean } }
  | { event: "answer.recap"; data: { qid: string; sentences: Array<{ sentence: string; ref: number | null; level: RecallLevel; unlearned: boolean }> } }
  | { event: "answer.saved"; data: { qid: string; answer: string; cached: boolean } }
  | { event: "exam.completed"; data: { examId: string } }
  // 6-5 채점 /sessions/{id}/evaluate
  | { event: "grading"; data: { qid: string } }
  | { event: "grade"; data: { qid: string; score: number; maxScore: number; verdict: GradeVerdict; comment: string } }
  | { event: "gap"; data: GapDto }
  | { event: "result"; data: { totalScore: number; finalVerdict: FinalVerdict; gapCount: number } }
  // 6-6 튜터 /sessions/{id}/tutor
  | { event: "tutor.token"; data: { token: string } }
  | { event: "tutor.message"; data: { id: string; gapId: string; request: string; response: string } }
  // 공통
  | { event: "error"; data: { code: string; message: string } }
  | { event: "done"; data: Record<string, unknown> };

export type SseEventName = SseEvent["event"];
export type SseEventData<N extends SseEventName> = Extract<SseEvent, { event: N }>["data"];
