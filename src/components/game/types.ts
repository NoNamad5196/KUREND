/**
 * [③] 게임 UI 가 쓰는 타입 — 전부 ①의 `src/contracts/game.ts` 를 재수출한다(중복 정의 금지).
 * 컴포넌트 쪽 이름(RunSummary·LifeResult·GraduationSummary·TeacherNote)은 계약 DTO 의 별칭.
 */
export {
  CHARACTERS,
  DEFAULT_MAX_LIVES,
  JUNIOR_CHARACTERS,
  LIFE_OUTCOMES,
  MAX_LIVES_OPTIONS,
  PERFECT_SCORE,
  RUN_STATUSES,
  lifeOutcomeFor,
  passScoreFor,
} from "@/contracts/game";
export type { ExamFormat, JuniorCharacter, LifeOutcome, RunStatus } from "@/contracts/game";
import type { ApplyLifeResponse, GraduationSummaryDto, RunDto, TeacherNoteDto } from "@/contracts/game";

export type RunSummary = RunDto;
export type LifeResult = ApplyLifeResponse;
export type GraduationSummary = GraduationSummaryDto;
export type TeacherNote = TeacherNoteDto;
