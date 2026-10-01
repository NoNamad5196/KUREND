import assert from "node:assert/strict";
import { test } from "node:test";
import { stripMarkdownBold } from "../plain-text";

test("removes prose emphasis without changing content, punctuation or line breaks", () => {
  assert.equal(stripMarkdownBold("**정답입니다!**\n준비 상태는 **CPU 할당을 기다리는 상태**이다."), "정답입니다!\n준비 상태는 CPU 할당을 기다리는 상태이다.");
  assert.equal(stripMarkdownBold("an **important** point and **2** answers"), "an important point and 2 answers");
  assert.equal(stripMarkdownBold("상태는**준비**입니다."), "상태는준비입니다.");
});

test("preserves fenced code and inline code exactly", () => {
  const text = "**예시**\n```python\nx = 2 ** 3\nlabel = '**raw**'\n```\n**답**: `2**3`은 8이다. ``const value = '**raw**'``";
  assert.equal(stripMarkdownBold(text), "예시\n```python\nx = 2 ** 3\nlabel = '**raw**'\n```\n답: `2**3`은 8이다. ``const value = '**raw**'``");
  assert.equal(stripMarkdownBold("~~~js\n2 ** 3\n~~~\n**결과**"), "~~~js\n2 ** 3\n~~~\n결과");
  assert.equal(stripMarkdownBold("    const label = '**raw**';\n\tprint('**raw**')\n**결과**"), "    const label = '**raw**';\n\tprint('**raw**')\n결과");
});

test("preserves mathematical operators and delimited equations", () => {
  for (const expression of ["2**3", "2 ** 3", "2 **3", "x **2", "(x + 1)**2", "x ** y", "a**b + c**d", "$x ** y$", "$$x ** y$$", "\\(x ** y\\)", "\\[x ** y\\]"]) assert.equal(stripMarkdownBold(expression), expression);
  assert.equal(stripMarkdownBold("**계산**: 2**3 + 4**2"), "계산: 2**3 + 4**2");
});

test("keeps user-visible literal and non-bold text intact", () => {
  for (const text of ["일반 문장입니다.", "a * b", "*항목*", "\\*\\*별표\\*\\*", "100% 정확한 설명\n다음 줄", "", "`"]) assert.equal(stripMarkdownBold(text), text);
});

test("streaming prose never exposes complete or half bold delimiters", () => {
  const text = "**준비 상태**는 **CPU**를 기다린다.";
  for (let length = 1; length <= text.length; length++) {
    const visible = stripMarkdownBold(text.slice(0, length), { streaming: true });
    assert.ok(!visible.includes("*"), `${length}: ${visible}`);
  }
  assert.equal(stripMarkdownBold("**미완성"), "미완성");
  assert.equal(stripMarkdownBold("**"), "");
});

test("streaming code remains literal, even before its closing delimiter arrives", () => {
  for (const text of ["`2 **", "```python\nx = 2 **", "~~~\n**literal", "$x **", "\\(x **"]) assert.equal(stripMarkdownBold(text, { streaming: true }), text);
});

test("sanitization is idempotent", () => {
  for (const text of ["**정답**: **준비**", "**예시** `2 ** 3`", "2**3 + 4**2", "**미완성"]) {
    const once = stripMarkdownBold(text);
    assert.equal(stripMarkdownBold(once), once);
  }
});


test("signed, fractional and Unicode powers remain literal outside code", () => {
  for (const expression of ["2 ** -3", "x**-2", "x** -2", "x ** +2", "x ** .5", "α ** 2", "α ** -2", "β**γ"]) assert.equal(stripMarkdownBold(expression), expression);
  assert.equal(stripMarkdownBold("**값**: 2 ** -3"), "값: 2 ** -3");
  assert.equal(stripMarkdownBold("**2**-3**"), "2**-3");
  assert.equal(stripMarkdownBold("**2** and **3**"), "2 and 3");
});

test("an unclosed currency dollar does not leak later streaming emphasis", () => {
  const text = "가격은 $5입니다. **중요**한 내용입니다.";
  for (let length = 1; length <= text.length; length++) assert.ok(!stripMarkdownBold(text.slice(0, length), { streaming: true }).includes("*"));
  assert.equal(stripMarkdownBold("$5 ** 2$ 뒤 **강조**", { streaming: true }), "$5 ** 2$ 뒤 강조");
  assert.equal(stripMarkdownBold("$x ** -2$ 뒤 **강조**"), "$x ** -2$ 뒤 강조");
});
