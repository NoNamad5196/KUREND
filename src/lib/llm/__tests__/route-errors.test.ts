import assert from "node:assert/strict";
import { test } from "node:test";
import { RouteError, type RouteBackend } from "../routes/backend";
import { createStubBackend, D_STUB_IDS as ids } from "../routes/backend-stub";
import { createRouteHandlers } from "../routes/handlers";
import { stubLlm } from "../stub";

process.env.LLM_STUB_DELAY_MS = "0";

// Represents C's independent instrumentation bundle, without inheriting D's
// RouteError constructor used by the request handler.
class AdapterRouteError extends Error {
  readonly name = "RouteError";
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const failures = [
  [400, "VALIDATION"], [401, "UNAUTHORIZED"], [404, "NOT_FOUND"],
  [409, "INVALID_STATE"], [502, "LLM_FAILED"],
] as const;

function request() {
  return new Request("http://localhost/api/d-test/prepare", {
    headers: { cookie: `${process.env.SESSION_COOKIE || "tb_uid"}=${ids.user}` },
  });
}

async function beforeStream(error: unknown) {
  const backend: RouteBackend = {
    ...createStubBackend(),
    async getSession() { throw error; },
  };
  return createRouteHandlers({ backend, llm: stubLlm }).prepare(request(), ids.prepareSession);
}

async function duringStream(error: unknown) {
  const backend: RouteBackend = {
    ...createStubBackend(),
    async commitSession() { throw error; },
  };
  const response = await createRouteHandlers({ backend, llm: stubLlm }).prepare(request(), ids.prepareSession);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const events = (await response.text()).split("\n\n")
    .filter((block) => block.startsWith("event: "))
    .map((block) => {
      const lines = block.split("\n");
      return { event: lines[0].slice(7), data: JSON.parse(lines[1].slice(6)) };
    });
  assert.equal(events.filter((event) => event.event === "done").length, 1);
  assert.equal(events.at(-1)?.event, "done");
  assert.equal(events.filter((event) => event.event === "error").length, 1);
  assert.ok(!events.some((event) => event.event === "ready"));
  return events.at(-2)?.data;
}

test("independently bundled adapter RouteErrors preserve their HTTP status, code, and message", async () => {
  for (const [status, code] of failures) {
    const error = new AdapterRouteError(status, code, `Adapter ${code}`);
    assert.ok(!(error instanceof RouteError));
    const response = await beforeStream(error);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code, message: error.message } });
  }
});

test("named adapter errors preserve their code and message after SSE starts", async () => {
  for (const [status, code] of failures) {
    const error = Object.assign(new Error(`Adapter ${code}`), { name: "RouteError", status, code });
    assert.ok(!(error instanceof RouteError));
    assert.deepEqual(await duringStream(error), { code, message: error.message });
  }
});

test("ordinary adapter failures remain sanitized HTTP 502 and SSE LLM_FAILED", async () => {
  const error = new Error("private database connection information");
  const response = await beforeStream(error);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: { code: "LLM_FAILED", message: "요청을 처리하지 못했습니다. 다시 시도해 주세요." },
  });
  assert.deepEqual(await duringStream(error), {
    code: "LLM_FAILED", message: "모델 응답을 처리하지 못했습니다. 다시 시도해 주세요.",
  });
});

test("invalid RouteError shapes cannot supply invalid HTTP statuses or public error payloads", async () => {
  const shape = { name: "RouteError", status: 409, code: "INVALID_STATE", message: "private detail" };
  const invalid = [
    null, undefined, "RouteError", 409,
    { ...shape, name: "Error" },
    { ...shape, status: "409" }, { ...shape, status: 204 }, { ...shape, status: 999 },
    { ...shape, status: Number.NaN }, { ...shape, status: undefined },
    { ...shape, code: {} }, { ...shape, code: "UNKNOWN" }, { ...shape, code: undefined },
    { ...shape, message: {} }, { ...shape, message: undefined }, { ...shape, message: " " },
  ];
  for (const error of invalid) {
    const response = await beforeStream(error);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: { code: "LLM_FAILED", message: "요청을 처리하지 못했습니다. 다시 시도해 주세요." },
    });
    assert.deepEqual(await duringStream(error), {
      code: "LLM_FAILED", message: "모델 응답을 처리하지 못했습니다. 다시 시도해 주세요.",
    });
  }
});

test("explicit authentication Responses keep their status and headers", async () => {
  const authResponse = Response.json({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } }, {
    status: 401, headers: { "Cache-Control": "no-store" },
  });
  assert.equal(await beforeStream(authResponse), authResponse);
});
