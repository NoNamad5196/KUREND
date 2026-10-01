import assert from "node:assert/strict";
import test from "node:test";
import { cleanSourceSentence, teachingChoicesFor } from "../teaching-choices";
import type { ChapterText } from "../types";

test("teaching choices drop markdown list markers and emphasis from source sentences", () => {
  const chapter: ChapterText = {
    title: "수요의 이해",
    points: [],
    text: "## 수요의 이해\n- **수요량의 변화**: 그 재화 자체의 가격이 변해서 수요곡선 위의 한 점에서 다른 점으로 옮겨 가는 것.\n| 구분 | 설명 |\n",
  };
  const choices = teachingChoicesFor(chapter, "수요량의 변화");
  const statement = choices.find((choice) => choice.id === "teach_statement")?.text ?? "";
  assert.equal(statement, "수요량의 변화: 그 재화 자체의 가격이 변해서 수요곡선 위의 한 점에서 다른 점으로 옮겨 가는 것.");
  for (const choice of choices) assert.doesNotMatch(choice.text, /(^|“)\s*[-*]\s|\*\*|\|/u);
});

test("cleanSourceSentence keeps ordinary sentences intact", () => {
  assert.equal(cleanSourceSentence("  가격이 오르면 수요량은 줄어든다.  "), "가격이 오르면 수요량은 줄어든다.");
  assert.equal(cleanSourceSentence("> - `탄력성`이 크다"), "탄력성이 크다");
  assert.equal(cleanSourceSentence("① 첫째 조건"), "첫째 조건");
});
