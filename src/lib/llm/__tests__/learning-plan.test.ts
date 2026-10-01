import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sourceLearningConcepts } from "../learning-plan";

for (const domain of ["economics", "os"]) {
  test(`${domain} source supplies five distinct chapter concepts and ten full-material concepts`, () => {
    const metadata = JSON.parse(readFileSync(new URL(`../../../../fixtures/chapters.${domain}.json`, import.meta.url), "utf8"));
    const text = readFileSync(new URL(`../../../../fixtures/${metadata.fileName}`, import.meta.url), "utf8");
    const first = metadata.chapters[0];
    for (const [chapter, count] of [
      [{ ...first, text: text.slice(first.startOffset, first.endOffset) }, 5],
      [{ title: metadata.title, points: [], text }, 10],
    ] as const) {
      const concepts = sourceLearningConcepts(chapter, count, first.points);
      assert.equal(concepts.length, count);
      assert.equal(new Set(concepts.map((entry) => entry.topic.replace(/\s+/gu, ""))).size, count);
      assert.ok(concepts.every((entry) => chapter.text.includes(entry.sourceQuote)));
      assert.ok(concepts.every((entry) => !/설명 목표|이 자료|이 노트|설명 연습/u.test(entry.sourceQuote)));
      assert.ok(concepts.some((entry) => entry.topic === first.points[0]));
    }
  });
}

test("preferred duplicates normalize whitespace and unsupported topics cannot enter the plan", () => {
  const text = "**준비 큐**는 실행을 기다리는 프로세스의 집합이다. 문맥 교환은 현재 실행 정보를 저장하고 다음 실행 정보를 복원한다. 스케줄러는 실행할 프로세스를 고르는 구성 요소이다.";
  const concepts = sourceLearningConcepts({ title: "스케줄링", points: [], text }, 3, ["준비 큐", "준비   큐", "없는 개념"]);
  assert.equal(concepts[0].topic, "준비 큐");
  assert.deepEqual(new Set(concepts.map((entry) => entry.topic)), new Set(["준비 큐", "문맥 교환", "스케줄러"]));
  assert.equal(concepts[0].sourceQuote, "**준비 큐**는 실행을 기다리는 프로세스의 집합이다.");
});

test("short or instructional sources fail instead of inventing placeholder objectives", () => {
  for (const text of ["자료가 짧다.", "이 자료의 학습 목표는 핵심 개념 다섯 가지를 설명하는 것이다.", "수요는 각 가격에서 구매할 의사와 능력이 있는 수량의 관계이다."]) {
    assert.throws(() => sourceLearningConcepts({ title: "자료", points: ["핵심 내용", "개념 1", "개념 2"], text }, 5), /확인하지 못했습니다/u);
  }
});
