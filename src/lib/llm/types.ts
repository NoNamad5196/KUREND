// Frozen public LLM signatures from implementation plan §7-1; game inputs are additive.
import type { AnswerSentenceDto, LearningErrorReason, TeachingChoiceDto } from "@/contracts/types";
import type { ConceptMasteryDto, JuniorCharacter } from "@/contracts/game";
import type { TeachingHintMode } from "@/lib/shared/teaching-hints";
export type ChapterText = { title: string; points: string[]; text: string };     // text = source.text.slice(start,end)
export type TaughtMsg = { ref: number; content: string };                        // 사용자 USER 메시지(excluded 제외), 1-base 순번

export interface Llm {
  /** 후배 질문에 대한 모범답안 선택지(자료 근거). objective·question·previous 는 표현을 고르는 참고일 뿐이다. */
  generateTeachingChoices?(input: { chapter: ChapterText; topic: string; objective?: string; question?: string; previous?: string[]; mode?: TeachingHintMode }): Promise<TeachingChoiceDto[]>;
  generateChapters(input: { sources: { sourceId: string; text: string }[]; persona?: JuniorCharacter }):
    Promise<{ title: string; chapters: { title: string; points: string[]; sourceId: string; startOffset: number; endOffset: number }[] }>;
  /** hintMode: 질문 위 힌트 — answers(모범답안 2개, 체험 계정) | keywords(모범 키워드 3개, 실제 계정). 기본 answers */
  prepareSession(input: { chapter: ChapterText; level: "EASY"|"HARD"; persona?: JuniorCharacter; examFormat?: "DESCRIPTIVE"|"OBJECTIVE"|"MIXED"; questionCount?: number; kind?: "CHAPTER"|"FINAL"; hintMode?: TeachingHintMode }):
    Promise<{ objectives: { id: string; text: string }[]; questions: { qid: string; order: number; points: number; question: string; objectiveRef: string; rubric: string; choices?: string[] }[]; firstQuestion: string; firstTeachingChoices?: TeachingChoiceDto[] }>;
  juniorTurn(input: { chapter: ChapterText; level: "EASY"|"HARD"; persona?: JuniorCharacter; objectives: {id:string;text:string}[]; heardConcepts: string[]; history: { role: "USER"|"JUNIOR"; stage: string; content: string; teachingChoices?: TeachingChoiceDto[] }[]; explanation: string; mastery?: ConceptMasteryDto[]; hintMode?: TeachingHintMode }):
    AsyncIterable<{ type: "concepts"; heardConcepts: string[]; added: string[] } | { type: "doubt"; content: string } | { type: "reaction"; content: string } | { type: "question"; content: string; coveredObjectives: string[]; teachingChoices?: TeachingChoiceDto[]; mastery?: ConceptMasteryDto[] }>;
  /** chapter 는 참고 자료(용어·표현)일 뿐, 지식의 범위는 taught(선배의 설명)가 정한다 */
  writeExamAnswer(input: { question: string; taught: TaughtMsg[]; heardConcepts: string[]; persona?: JuniorCharacter; choices?: string[]; chapter?: ChapterText }):
    AsyncIterable<{ type: "sources"; sources: TaughtMsg[] } | { type: "thought"; token: string; closed: boolean } | { type: "sentence"; text: string; ref: number|null; level: "STRONG"|"FAINT"|"NONE"; unlearned: boolean } | { type: "final"; answer: string }>;
  gradeExam(input: { chapter: ChapterText; questions: { qid: string; question: string; points: number; rubric: string; choices?: string[] }[]; answers: { qid: string; answer: string; sentences?: AnswerSentenceDto[] }[]; taught: TaughtMsg[]; persona?: JuniorCharacter }):
    AsyncIterable<{ type: "grade"; qid: string; score: number; maxScore: number; verdict: "CORRECT"|"PARTIAL"|"WRONG"; comment: string } | { type: "gap"; qid: string; title: string; diagnosis: string; evidenceQuote: string; errorReason?: LearningErrorReason; concepts: string[]; sourceExcerpt: string }>;
  generateTeacherNote(input: { chapter: ChapterText; persona?: JuniorCharacter }): Promise<{ mustTeach: string[]; keyTakeaways: string[]; confusing: string[]; likelyQuestions: string[] }>;
  tutorExplain(input: { chapter: ChapterText; gap: { title: string; diagnosis: string; sourceExcerpt: string }; request: string; persona?: JuniorCharacter }):
    AsyncIterable<{ type: "token"; token: string } | { type: "final"; response: string }>;
}
