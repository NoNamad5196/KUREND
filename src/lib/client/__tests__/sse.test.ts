import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, sse } from "../api";

function response(text: string, oneByte = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    if (oneByte) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    else controller.enqueue(bytes);
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}

test("CRLF, multiline JSON, comments, and split Korean UTF-8 preserve SSE events", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response(': ping\r\nevent: junior.message\r\ndata: {"content":\r\ndata: "안녕 선배 🌱"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n', true));
  const events: unknown[] = [];
  await sse("/test", {}, (name, data) => events.push({ name, data }));
  assert.deepEqual(events, [{ name: "junior.message", data: { content: "안녕 선배 🌱" } }, { name: "done", data: {} }]);
});

test("an incomplete stream cannot report success", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response('event: user.saved\ndata: {"messageId":"msg_saved"}\n\n'));
  await assert.rejects(sse("/test", {}, () => undefined), (error: unknown) => error instanceof ApiError && error.details.reason === "STREAM_INTERRUPTED");
});

test("invalid JSON is classified without echoing the model output", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response('event: junior.message\ndata: PRIVATE_RAW_OUTPUT\n\n'));
  await assert.rejects(sse("/test", {}, () => undefined), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.details.reason, "LLM_RESPONSE_PARSE_FAILED");
    assert.ok(!error.message.includes("PRIVATE_RAW_OUTPUT"));
    return true;
  });
});

test("session recovery details survive an SSE error and release the reader", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response('event: error\ndata: {"code":"INVALID_STATE","message":"다시 불러오는 중","reason":"CHAT_SESSION_INVALID","replacementSessionId":"sess_new"}\n\nevent: done\ndata: {}\n\n'));
  await assert.rejects(sse("/test", {}, () => undefined), (error: unknown) => error instanceof ApiError && error.details.replacementSessionId === "sess_new");
});

test("null event data is a typed parse error, not a frontend crash", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response('event: error\ndata: null\n\n'));
  await assert.rejects(sse("/test", {}, () => assert.fail("invalid data must not reach the UI")), (error: unknown) => error instanceof ApiError && error.details.reason === "LLM_RESPONSE_PARSE_FAILED");
});
