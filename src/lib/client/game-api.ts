/**
 * [③] 게임 API 클라이언트 — ①의 라우트(계획서 §2, docs/game-api.md)에 1:1. 응답 타입은 contracts/game.ts.
 */
import type {
  ApplyLifeResponse,
  CreateRunRequest,
  CurrentRunResponse,
  GraduationSummaryDto,
  RunDto,
  SessionGameDto,
  TeacherNoteDto,
  TeacherNoteListResponse,
} from "@/contracts/game";
import { api } from "./api";

const enc = encodeURIComponent;

export const gameApi = {
  /** materialId 가 있으면 그 자료의 ACTIVE Run, 없으면 가장 최근 ACTIVE Run. 없으면 run: null */
  getCurrentRun: (materialId?: string) =>
    api.get<CurrentRunResponse>(materialId ? `/runs/current?materialId=${enc(materialId)}` : "/runs/current").then((r) => r.run),
  createRun: (body: CreateRunRequest) => api.post<RunDto>("/runs", body),
  getRun: (runId: string) => api.get<RunDto>(`/runs/${enc(runId)}`),
  /** 서버가 session.score 로 판정한다. 같은 세션에 두 번 부르면 applied:false 로 같은 결과를 돌려준다. */
  applyLife: (runId: string, sessionId: string) => api.post<ApplyLifeResponse>(`/runs/${enc(runId)}/life`, { sessionId }),
  graduate: (runId: string) => api.post<{ run: RunDto; summary: GraduationSummaryDto }>(`/runs/${enc(runId)}/graduate`),
  getSessionGame: (sessionId: string) => api.get<SessionGameDto>(`/sessions/${enc(sessionId)}/game`),
  getTeacherNotes: (materialId: string) => api.get<TeacherNoteListResponse>(`/materials/${enc(materialId)}/teacher-note`),
  /** 없는 챕터의 강의노트를 생성(1회, 이후 캐시). ②의 LLM 메서드 generateTeacherNote 와 이름을 구분. */
  requestTeacherNote: (materialId: string, chapterId: string) =>
    api.post<TeacherNoteDto>(`/materials/${enc(materialId)}/teacher-note`, { chapterId }),
};
