/**
 * [③] 게임 API 클라이언트 — ①의 라우트(계획서 §2, docs/game-api.md)에 1:1. 응답 타입은 contracts/game.ts.
 */
import type {
  AlbumResponse,
  ApplyLifeResponse,
  CreateRunRequest,
  ChangeCharacterRequest,
  ChangeCharacterResponse,
  CreateWrongNoteRequest,
  CurrentRunResponse,
  GraduateResponse,
  ReteachResponse,
  RunDto,
  SessionGameDto,
  StartFinalResponse,
  TeacherNoteDto,
  TeacherNoteListResponse,
  UpdateWrongNoteRequest,
  WrongNoteDto,
  WrongNoteListResponse,
} from "@/contracts/game";
import { api } from "./api";

const enc = encodeURIComponent;

/** LIFE·진행·후배가 바뀌는 호출 뒤에 알린다 — 상단 "지금 가르치는 후배" 칩이 화면 이동 없이 바로 갱신된다. */
export const RUN_CHANGED_EVENT = "kurend:run-changed";
function notifyRunChanged<T>(value: T): T {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RUN_CHANGED_EVENT));
  return value;
}

export const gameApi = {
  /** materialId 가 있으면 그 자료의 ACTIVE Run, 없으면 가장 최근 ACTIVE Run. 없으면 run: null */
  getCurrentRun: (materialId?: string) =>
    api.get<CurrentRunResponse>(materialId ? `/runs/current?materialId=${enc(materialId)}` : "/runs/current").then((r) => r.run),
  createRun: (body: CreateRunRequest) => api.post<RunDto>("/runs", body).then(notifyRunChanged),
  changeCharacter: (runId: string, body: ChangeCharacterRequest) =>
    api.patch<ChangeCharacterResponse>(`/runs/${enc(runId)}`, body).then(notifyRunChanged),
  getRun: (runId: string) => api.get<RunDto>(`/runs/${enc(runId)}`),
  /** 서버가 session.score 로 판정한다. 같은 세션에 두 번 부르면 applied:false 로 같은 결과를 돌려준다. */
  applyLife: (runId: string, sessionId: string) => api.post<ApplyLifeResponse>(`/runs/${enc(runId)}/life`, { sessionId }).then(notifyRunChanged),
  /** 졸업시험(자료 전체 · 5문항 객관식+서술형) 세션을 만들거나 진행 중인 것을 돌려준다 → /session/{id}/prepare */
  startFinal: (runId: string) => api.post<StartFinalResponse>(`/runs/${enc(runId)}/final`),
  graduate: (runId: string) => api.post<GraduateResponse>(`/runs/${enc(runId)}/graduate`).then(notifyRunChanged),
  getSessionGame: (sessionId: string) => api.get<SessionGameDto>(`/sessions/${enc(sessionId)}/game`),
  getTeacherNotes: (materialId: string) => api.get<TeacherNoteListResponse>(`/materials/${enc(materialId)}/teacher-note`),
  /** 없는 챕터의 강의노트를 생성(1회, 이후 캐시). ②의 LLM 메서드 generateTeacherNote 와 이름을 구분. */
  requestTeacherNote: (materialId: string, chapterId: string) =>
    api.post<TeacherNoteDto>(`/materials/${enc(materialId)}/teacher-note`, { chapterId }),

  /* ── 오답노트 (P1) ── */
  /** 틀린 문항은 채점 후 자동 저장된다. 수동 생성/이유 채우기용(같은 문항은 기존 노트를 돌려준다). */
  createWrongNote: (body: CreateWrongNoteRequest) => api.post<WrongNoteDto>("/wrong-notes", body),
  /** 최신순. materialId 를 주면 그 자료의 노트만. */
  listWrongNotes: (materialId?: string) =>
    api.get<WrongNoteListResponse>(materialId ? `/wrong-notes?materialId=${enc(materialId)}` : "/wrong-notes").then((r) => r.notes),
  getWrongNote: (wrongNoteId: string) => api.get<WrongNoteDto>(`/wrong-notes/${enc(wrongNoteId)}`),
  /** 선배가 생각한 이유를 저장하면 AI 비교(aiComparison)가 함께 돌아온다 */
  updateWrongNote: (wrongNoteId: string, body: UpdateWrongNoteRequest) => api.patch<WrongNoteDto>(`/wrong-notes/${enc(wrongNoteId)}`, body),
  /** 같은 챕터에 "다시 가르치기" 세션을 만든다 → /session/{sessionId}/prepare 로 이동 */
  reteachWrongNote: (wrongNoteId: string) => api.post<ReteachResponse>(`/wrong-notes/${enc(wrongNoteId)}/reteach`),

  /* ── 졸업앨범 (P2) ── */
  /** 졸업생(GRADUATED)과 떠나간 후배(GAME_OVER), 최근 종료순 */
  getAlbum: () => api.get<AlbumResponse>("/runs/album"),
};
