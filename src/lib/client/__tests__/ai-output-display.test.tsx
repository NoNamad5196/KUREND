import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatThread } from "@/components/session/teach/ChatThread";
import { SpeechBubble } from "@/components/session/SpeechBubble";
import { AnswerSheet } from "@/components/exam/AnswerSheet";
import { Choices, pickedChoiceIndex } from "@/components/exam/Choices";
import { GradeBox } from "@/components/exam/verdict";
import { RecallPanel } from "@/components/exam/RecallPanel";

// tsx's node runner uses classic JSX; Next compiles these same components automatically.
Object.assign(globalThis, { React });

test("persisted junior messages lose bold while the user's explanation remains exact", () => {
  const html = renderToStaticMarkup(<ChatThread character="MALE_EASY" juniorName="남학생" messages={[
    { messageId: "u1", role: "USER", stage: "ANSWER", content: "**내 원문** `2**3`", createdAt: "2026-10-01T00:00:00Z" },
    { messageId: "j1", role: "JUNIOR", stage: "REACTION", content: "**선배님, 이해했습니다!**", createdAt: "2026-10-01T00:00:01Z" },
  ]} pending={null} reactionText="" sending={false} animateId={null} onResend={() => {}} />);
  assert.ok(html.includes("**내 원문** `2**3`"));
  assert.ok(html.includes("이해했습니다!"));
  assert.ok(!html.includes("**이해했습니다!**"));
  assert.ok(!html.includes("선배님"));
});

test("saved question, answer, option and grading prose are clean on first render", () => {
  const html = renderToStaticMarkup(<AnswerSheet courseName="운영체제" items={[{ qid: "q1", order: 1, points: 20, question: "**준비 상태**를 설명하시오.", text: "**CPU** 할당을 기다리는 상태이다.", choices: ["**준비**", "실행", "대기", "종료"], status: "done", extra: <GradeBox state="done" grade={{ verdict: "CORRECT", score: 20, maxScore: 20, comment: "**정답입니다!**" }} /> }]} />);
  assert.ok(!html.includes("**"));
  for (const expected of ["준비 상태", "CPU", "정답입니다!"]) assert.ok(html.includes(expected));
});

test("new answer-sheet numbers and old saved choice marks keep selection highlighting", () => {
  const choices = ["첫 번째", "두 번째", "**세 번째**", "네 번째"];
  for (const answer of ["3번", "③", "3.", "(3)", "**3번**", "세 번째"]) assert.equal(pickedChoiceIndex(answer, choices), 2, answer);
  assert.equal((renderToStaticMarkup(<Choices choices={choices} answer="3번" />).match(/새내기 선택/g) ?? []).length, 1);
});

test("speech prose is sanitized, but user and evidence display preserve literal text", () => {
  assert.ok(!renderToStaticMarkup(<SpeechBubble>**리액션**</SpeechBubble>).includes("**"));
  assert.ok(renderToStaticMarkup(<SpeechBubble tone="user">**사용자 원문**</SpeechBubble>).includes("**사용자 원문**"));
  const evidence = "**원문 강조**와 `x ** 2`";
  const html = renderToStaticMarkup(<RecallPanel sources={[{ ref: 1, content: evidence }]} highlights={{}} />);
  assert.ok(html.includes(evidence));
});


test("legacy cached SSE answers keep formal display without mutating their raw input", () => {
  const items = [
    { qid: "q1", order: 1, points: 20, question: "준비 상태를 설명하시오.", text: "선배님, 준비 상태는 CPU 할당을 기다리는 상태예요.", status: "done" as const },
    { qid: "q2", order: 2, points: 20, question: "정답을 고르시오.", text: "③ 선배님, 세 번째라고 배웠습니다!", choices: ["첫째", "둘째", "셋째", "넷째"], status: "done" as const },
    { qid: "q3", order: 3, points: 20, question: "코드를 쓰시오.", text: "```python\nx = 2 ** -3\n```", status: "done" as const },
  ];
  const original = structuredClone(items);
  const html = renderToStaticMarkup(<AnswerSheet courseName="운영체제" items={items} />);
  assert.ok(html.includes("준비 상태는 CPU 할당을 기다리는 상태다."));
  assert.ok(html.includes("3번"));
  assert.ok(!html.includes("선배님"));
  assert.ok(html.includes("x = 2 ** -3"));
  assert.deepEqual(items, original);
});
