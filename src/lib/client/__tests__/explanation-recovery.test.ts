import assert from "node:assert/strict";
import { test } from "node:test";
import type { MessageDto } from "@/contracts/types";
import { explanationRecovery } from "../explanation-recovery";

const message = (messageId: string, role: MessageDto["role"], content = "설명 내용", stage: MessageDto["stage"] = role === "USER" ? "ANSWER" : "QUESTION"): MessageDto =>
  ({ messageId, role, content, stage, createdAt: "2026-01-01T00:00:00.000Z" });

test("a turn committed before the stream disconnected is restored without resending", () => {
  const history = [message("q1", "JUNIOR"), message("u1", "USER"), message("r1", "JUNIOR", "알겠어요", "REACTION"), message("q2", "JUNIOR")];
  assert.deepEqual(explanationRecovery(history, { content: "설명 내용", messageId: "u1" }), { status: "answered", messageId: "u1" });
});

test("an acknowledged USER with no persisted junior response can reuse the existing retry path", () => {
  assert.deepEqual(explanationRecovery([message("q1", "JUNIOR"), message("u1", "USER")], { content: "설명 내용", messageId: "u1" }),
    { status: "unanswered", messageId: "u1" });
});

test("a stream lost before user.saved still discovers its committed turn after the attempt marker", () => {
  const history = [message("old", "USER"), message("q1", "JUNIOR"), message("u1", "USER"), message("q2", "JUNIOR")];
  assert.deepEqual(explanationRecovery(history, { content: "설명 내용", afterMessageId: "q1" }), { status: "answered", messageId: "u1" });
  assert.deepEqual(explanationRecovery(history.slice(0, 3), { content: "설명 내용", afterMessageId: "q1" }), { status: "unanswered", messageId: "u1" });
});

test("earlier identical explanations do not hide an unsaved attempt", () => {
  assert.deepEqual(explanationRecovery([message("old", "USER"), message("q1", "JUNIOR")], { content: "설명 내용", afterMessageId: "q1" }), { status: "not_saved" });
});

test("missing acknowledged messages or changed conversation order never authorize another POST", () => {
  const history = [message("u1", "USER"), message("u2", "USER")];
  assert.deepEqual(explanationRecovery(history, { content: "설명 내용", messageId: "missing" }), { status: "unknown" });
  assert.deepEqual(explanationRecovery(history, { content: "설명 내용", messageId: "u1" }), { status: "unknown" });
  assert.deepEqual(explanationRecovery(history, { content: "설명 내용", afterMessageId: "missing" }), { status: "unknown" });
});
