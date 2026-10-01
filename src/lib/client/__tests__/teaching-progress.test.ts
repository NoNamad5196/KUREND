import assert from "node:assert/strict";
import { test } from "node:test";
import { coveredTeachingObjectives } from "../teaching-progress";

const objectives = [{ id: "o1", text: "수요 법칙을 설명할 수 있다" }, { id: "o2", text: "가격과 수요량의 관계를 설명할 수 있다" }];

test("a completed male lesson restores coverage in a fresh browser without local progress", () => {
  assert.deepEqual(coveredTeachingObjectives(objectives, [], [
    { concept: "수요 법칙", exposureCount: 1, mastery: 100 },
    { concept: "가격과 수요량의 관계", exposureCount: 1, mastery: 100 },
  ]), ["o1", "o2"]);
});

test("one KU exposure does not count as fully learned and unrelated concepts do not cover a lesson", () => {
  assert.deepEqual(coveredTeachingObjectives(objectives, [], [
    { concept: "수요 법칙", exposureCount: 1, mastery: 50 },
    { concept: "다른 수업", exposureCount: 2, mastery: 100 },
  ]), []);
});

test("current stream progress remains available while persisted mastery is being refreshed", () => {
  assert.deepEqual(coveredTeachingObjectives(objectives, ["o1", "o2"], []), ["o1", "o2"]);
  assert.deepEqual(coveredTeachingObjectives(objectives, ["unrelated"], []), []);
  assert.deepEqual(coveredTeachingObjectives([], ["o1"], []), []);
});
