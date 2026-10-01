import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { completeJSONWith, LlmFailure } from "../provider";

test("invalid JSON receives one repair instruction and a valid retry is returned", async () => {
  const systems: string[] = [];
  const users: string[] = [];
  const value = await completeJSONWith(async (system, user, options) => {
    systems.push(system);
    users.push(user);
    assert.equal(options.temperature, 0);
    return systems.length === 1 ? "```json\n{}\n```" : '{"count":3}';
  }, "한국어 지시", "원래 요청", z.object({ count: z.number().int() }), { temperature: 0 });
  assert.deepEqual(value, { count: 3 });
  assert.equal(systems.length, 2);
  assert.match(systems[1], /JSON 객체만/);
  assert.deepEqual(users, ["원래 요청", "원래 요청"]);
});

test("schema-invalid responses stop after the second attempt with LLM_FAILED", async () => {
  let attempts = 0;
  await assert.rejects(completeJSONWith(async () => {
    attempts += 1;
    return '{"count":-1}';
  }, "", "", z.object({ count: z.number().positive() })), (error: unknown) => {
    assert.ok(error instanceof LlmFailure);
    assert.equal(error.code, "LLM_FAILED");
    return true;
  });
  assert.equal(attempts, 2);
});

test("transport failures are not mistaken for JSON repair requests", async () => {
  let attempts = 0;
  const failure = new LlmFailure("네트워크 연결 실패");
  await assert.rejects(completeJSONWith(async () => {
    attempts += 1;
    throw failure;
  }, "", "", z.object({})), (error) => error === failure);
  assert.equal(attempts, 1);
});

test("a stalled provider is aborted within the total request budget without a retry", async () => {
  let attempts = 0;
  let signal: AbortSignal | undefined;
  await assert.rejects(completeJSONWith(async (_system, _user, options) => {
    attempts += 1;
    signal = options.signal;
    return new Promise<string>(() => {});
  }, "", "", z.object({}), { timeoutMs: 30 }), /대기 시간을 초과/);
  assert.equal(attempts, 1);
  assert.equal(signal?.aborted, true);
});

test("JSON repair shares the original deadline and caps generated tokens", async () => {
  const budgets: number[] = [];
  const result = await completeJSONWith(async (_system, _user, options) => {
    budgets.push(options.timeoutMs!);
    assert.equal(options.maxOutputTokens, 1_500);
    if (budgets.length === 1) {
      await new Promise(resolve => setTimeout(resolve, 30));
      return "invalid";
    }
    return '{"count":3}';
  }, "", "", z.object({ count: z.number() }), { timeoutMs: 1_000, maxOutputTokens: 2_000 });
  assert.deepEqual(result, { count: 3 });
  assert.equal(budgets.length, 2);
  assert.ok(budgets[1] < budgets[0]);
});
