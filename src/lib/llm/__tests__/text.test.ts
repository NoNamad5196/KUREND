import assert from "node:assert/strict";
import { test } from "node:test";
import { compactText, paragraphizeSources } from "../text";

test("paragraph source offsets reconstruct mixed Korean, CRLF and emoji text exactly", () => {
  const sources = [
    { sourceId: "src_a", text: `  첫 문단 😀\r\n\r\n${"스케줄링 설명 😀 ".repeat(200)}\n\n마지막 문단\n` },
    { sourceId: "src_b", text: `두 번째 자료\n\n${"수요량은 가격과 반대로 움직인다. ".repeat(70)}\n\n` },
  ];
  const result = paragraphizeSources(sources);
  for (const source of sources) {
    const paragraphs = result.paragraphs.filter((paragraph) => paragraph.sourceId === source.sourceId);
    let next = 0;
    for (const paragraph of paragraphs) {
      assert.equal(paragraph.startOffset, next);
      assert.equal(paragraph.text, source.text.slice(paragraph.startOffset, paragraph.endOffset));
      assert.ok(paragraph.endOffset > paragraph.startOffset);
      assert.doesNotMatch(paragraph.text, /[\uD800-\uDBFF]$/u);
      assert.doesNotMatch(paragraph.text, /^[\uDC00-\uDFFF]/u);
      next = paragraph.endOffset;
    }
    assert.equal(paragraphs.map((paragraph) => paragraph.text).join(""), source.text);
    assert.equal(next, source.text.length);
  }
});

test("sources too short for four 300-character chapters are rejected", () => {
  assert.throws(() => paragraphizeSources([{ sourceId: "src_short", text: "짧은 자료" }]), /300자/);
  assert.throws(() => paragraphizeSources([{ sourceId: "src_short", text: "가".repeat(600) }]), /1,200자/);
});

test("source input budget includes later uploads and chapter compaction retains both ends", () => {
  const result = paragraphizeSources([
    { sourceId: "src_large", text: "앞쪽 설명 😀 ".repeat(10_000) },
    { sourceId: "src_later", text: "두 번째 설명 ".repeat(3_000) },
  ]);
  assert.ok(result.sources.every((source) => source.length > 0 && source.paragraphs.length > 0));
  assert.ok(result.sources.reduce((sum, source) => sum + source.length, 0) <= 40_000);
  assert.ok(result.sources[0].truncated);
  const original = `시작 ${"😀가나다".repeat(3_000)} 끝`;
  const compacted = compactText(original);
  assert.ok(compacted.length <= 8_000);
  assert.ok(compacted.startsWith("시작 ") && compacted.endsWith(" 끝"));
  assert.match(compacted, /중간 생략/);
  assert.doesNotMatch(compacted, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
});
