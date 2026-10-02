import assert from "node:assert/strict";
import { test } from "node:test";
import type { AlbumEntryDto, RunDto } from "@/contracts/game";
import { rosterNote, rosterOf } from "../album-roster";

const run = (overrides: Partial<RunDto> & { runId: string }): RunDto => ({
  materialId: "mat_1", materialTitle: "정보처리기사 (이론편)", courseName: "정보처리기사", character: "MALE_EASY",
  lives: 3, maxLives: 3, passScore: 60, examFormat: "OBJECTIVE", status: "ACTIVE", startedAt: "2026-09-20T00:00:00.000Z", endedAt: null,
  progress: { cleared: 4, total: 12, chapters: [] }, next: null,
  finalExam: { status: "LOCKED", sessionId: null, bestScore: null, attempts: 0, questionCount: 10 }, canGraduate: false,
  ...overrides,
});
const ended = (overrides: Partial<AlbumEntryDto> & { runId: string; status: AlbumEntryDto["status"] }): AlbumEntryDto => ({
  character: "FEMALE_NORMAL", materialId: "mat_2", materialTitle: "초치기", courseName: "정보처리기사",
  startedAt: "2026-09-25T00:00:00.000Z", endedAt: "2026-09-30T00:00:00.000Z",
  summary: { runId: "run_x", character: "FEMALE_NORMAL", materialTitle: "초치기", courseName: "정보처리기사", days: 6, chapters: 2, averageScore: 71, exams: 4, perfectCount: 0, wrongNoteCount: 3, finalLives: 0, maxLives: 3, graduatedAt: "2026-09-30T00:00:00.000Z" },
  ...overrides,
});

test("미졸업자 명단: 졸업 직전 → 재학생 → 졸업 실패(최근 순) 순서이고, 졸업 성공은 빠진다", () => {
  const roster = rosterOf({
    active: [run({ runId: "run_a" }), run({ runId: "run_b", character: "KU_HARD", lives: 1, canGraduate: true, progress: { cleared: 12, total: 12, chapters: [] },
      finalExam: { status: "PASSED", sessionId: "sess", bestScore: 84, attempts: 1, questionCount: 10 } })],
    departed: [
      ended({ runId: "run_old", status: "GAME_OVER", endedAt: "2026-09-10T00:00:00.000Z" }),
      ended({ runId: "run_new", status: "GAME_OVER" }),
    ],
  }, new Date("2026-10-02T00:00:00.000Z").getTime());
  assert.deepEqual(roster.map((e) => [e.runId, e.status, e.label]), [
    ["run_b", "NEAR_GRADUATION", "졸업 직전"], ["run_a", "ENROLLED", "재학생"], ["run_new", "FAILED", "졸업 실패"], ["run_old", "FAILED", "졸업 실패"],
  ]);
  assert.deepEqual([roster[1].cleared, roster[1].total, roster[1].lives, roster[1].days], [4, 12, 3, 13]);
  assert.deepEqual([roster[2].cleared, roster[2].total, roster[2].lives, roster[2].maxLives, roster[2].days], [2, null, 0, 3, 6]);
  assert.equal(rosterNote(roster[1]), "목차 12개 중 4개 통과");
  assert.match(rosterNote(roster[0]), /졸업시험 통과/u);
  assert.match(rosterNote(roster[2]), /졸업하지 못했어요/u);
});

test("졸업시험 상태에 따른 안내 문구와 빈 명단", () => {
  const ready = rosterOf({ active: [run({ runId: "r", progress: { cleared: 12, total: 12, chapters: [] }, finalExam: { status: "READY", sessionId: null, bestScore: 47, attempts: 1, questionCount: 10 } })], departed: [] });
  assert.equal(ready[0].status, "NEAR_GRADUATION", "최종 졸업시험만 남으면 졸업 직전");
  const fresh = rosterOf({ active: [run({ runId: "f", progress: { cleared: 12, total: 12, chapters: [] }, finalExam: { status: "READY", sessionId: null, bestScore: null, attempts: 0, questionCount: 10 } })], departed: [] });
  assert.equal(rosterNote(fresh[0]), "목차를 모두 통과했어요 · 최종 졸업시험만 남았어요");
  assert.equal(rosterNote(ready[0]), "졸업시험 1회 불합격 · 다시 도전할 수 있어요");
  const inProgress = rosterOf({ active: [run({ runId: "r", finalExam: { status: "IN_PROGRESS", sessionId: "s", bestScore: null, attempts: 0, questionCount: 10 } })], departed: [] });
  assert.equal(rosterNote(inProgress[0]), "졸업시험 진행 중 · 10문항");
  // 이전 서버 응답(active 없음)도 깨지지 않는다
  assert.deepEqual(rosterOf({ departed: [] } as unknown as Parameters<typeof rosterOf>[0]), []);
  // 졸업한 런이 active 에 섞여 와도 재학생으로 보이지 않는다
  assert.deepEqual(rosterOf({ active: [run({ runId: "g", status: "GRADUATED" })], departed: [] }), []);
});
