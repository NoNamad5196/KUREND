import assert from "node:assert/strict";
import { test } from "node:test";
import { finalExamOf, type RunWithRelations } from "../run-dto";
import type { ProgressRow } from "../run-rules";

const rows: ProgressRow[] = [{ chapterId: "chp_done", title: "완료한 챕터", order: 1, attempts: 1, bestScore: 100, cleared: true }];
const runWith = (sessions: unknown[]) => ({ status: "ACTIVE", finalPassedAt: null, sessions }) as RunWithRelations;

test("new or unprepared graduation exams use ten questions", () => {
  for (const sessions of [[], [{ id: "sess_preparing", status: "PREPARING", score: null, exam: null }]]) {
    assert.equal(finalExamOf(runWith(sessions), rows).questionCount, 10);
  }
});

test("resuming saved graduation exams reports their actual counts without changing them", () => {
  for (const count of [3, 5, 7, 10]) {
    const run = runWith([{ id: "sess_saved", status: "EXAM_IN_PROGRESS", score: null, exam: { _count: { questions: count } } }]);
    const before = structuredClone(run);
    const final = finalExamOf(run, rows);
    assert.equal(final.status, "IN_PROGRESS");
    assert.equal(final.sessionId, "sess_saved");
    assert.equal(final.questionCount, count);
    assert.deepEqual(run, before);
  }
});

test("a retake follows the new ten-question rule while retaining the past score and attempt", () => {
  const run = runWith([{ id: "sess_failed", status: "RESULT_READY", score: 40, exam: { _count: { questions: 7 } } }]);
  const before = structuredClone(run);
  const final = finalExamOf(run, rows);
  assert.equal(final.status, "READY");
  assert.equal(final.questionCount, 10);
  assert.equal(final.bestScore, 40);
  assert.equal(final.attempts, 1);
  assert.deepEqual(run, before);
});
