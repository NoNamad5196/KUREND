import assert from "node:assert/strict";
import { test } from "node:test";
import { teachingHintModeFor } from "../demo-auth";

test("체험 계정은 모범답안, 구글 로그인 실제 계정은 모범 키워드", () => {
  assert.equal(teachingHintModeFor("usr_demo1"), "answers");
  assert.equal(teachingHintModeFor("usr_google_1234"), "keywords");
  assert.equal(teachingHintModeFor("usr_abcdef"), "keywords");
});
