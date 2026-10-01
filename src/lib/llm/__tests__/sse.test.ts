import assert from "node:assert/strict";
import { test } from "node:test";
import { createSse } from "../../server/sse";

test("SSE escapes multiline data and closes with one terminal done event", async () => {
  const sse = createSse();
  sse.send("junior.token", { token: "안녕\n선배 😀" });
  sse.close();
  sse.close();
  sse.send("junior.token", { token: "late" });
  assert.equal(sse.response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const wire = await sse.response.text();
  assert.ok(wire.startsWith(": connected\n\n"));
  assert.equal(wire.match(/event: done/g)?.length, 1);
  assert.ok(wire.endsWith("event: done\ndata: {}\n\n"));
  assert.equal(JSON.parse(wire.split("data: ")[1].split("\n\n")[0]).token, "안녕\n선배 😀");
  assert.ok(!wire.includes("late"));
});

test("error is followed by done, and explicit done is not duplicated", async () => {
  const failure = createSse();
  failure.send("error", { code: "LLM_FAILED", message: "다시 시도" });
  failure.close();
  assert.match(await failure.response.text(), /event: error[\s\S]*event: done/);
  const explicit = createSse();
  explicit.send("done", {});
  explicit.ping();
  explicit.close();
  const wire = await explicit.response.text();
  assert.equal(wire.match(/event: done/g)?.length, 1);
  assert.ok(!wire.includes(": ping"));
});

test("cancelled stream tolerates late model events and close", async () => {
  const sse = createSse();
  await sse.response.body!.cancel();
  assert.doesNotThrow(() => {
    sse.send("tutor.token", { token: "취소 후 응답" });
    sse.close();
  });
});
