import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";

test("valid session continuity is distinct from expiry and unavailable account storage", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "kurend-session-continuity-"));
  const url = `file:${join(directory, "auth.db")}`;
  const envKeys = ["DATABASE_URL", "NODE_ENV", "SESSION_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"] as const;
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, { DATABASE_URL: url, NODE_ENV: "production", SESSION_SECRET: "test-stable-session-key" });
  const client = createClient({ url });
  const now = Date.now();
  let clock = now;
  t.mock.method(Date, "now", () => clock);
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { diagnostics.push(args); });
  t.mock.method(console, "warn", (...args: unknown[]) => { diagnostics.push(args); });
  let disconnect: (() => Promise<void>) | undefined;
  try {
    await client.execute('CREATE TABLE "User" (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, onboardingCompletedAt DATETIME)');
    await client.execute('INSERT INTO "User" (id, nickname) VALUES (\'usr_persisted\', \'Private nickname\')');
    const { db } = await import("@/lib/server/db");
    disconnect = () => db.$disconnect();
    const { requireUser, sessionCookieHeader } = await import("@/lib/server/auth");
    const { json, withApi } = await import("@/lib/server/http");
    const endpoint = withApi(async (req) => json(await requireUser(req)));
    const context = { params: Promise.resolve({}) };
    const cookie = sessionCookieHeader("usr_persisted").split(";")[0];
    const request = (value = cookie) => new Request("https://kurend.test/api/auth/me", { headers: { cookie: value } });

    await t.test("reloads and hours or days of inactivity preserve an unexpired session", async () => {
      for (const elapsed of [0, 60 * 60 * 1000, 24 * 60 * 60 * 1000, 29 * 24 * 60 * 60 * 1000]) {
        clock = now + elapsed;
        const response = await endpoint(request(), context);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).userId, "usr_persisted");
        assert.equal(response.headers.get("set-cookie"), null, "verification must not delete or replace the cookie");
      }
      clock = now;
    });

    await t.test("reopening a persistent DB preserves the same signed session", async () => {
      await db.$disconnect();
      const response = await endpoint(request(), context);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).userId, "usr_persisted");
    });

    await t.test("a lost account with a valid cookie is 503, not a false expiry or a recreated account", async () => {
      await client.execute('DELETE FROM "User"');
      const response = await endpoint(request(), context);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "AUTH_UNAVAILABLE");
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal((await client.execute('SELECT count(*) AS count FROM "User"')).rows[0].count, 0);

      const { installLlmRouteBackend } = await import("@/lib/server/llm-backend");
      const { getRouteBackend } = await import("@/lib/llm/routes/backend");
      installLlmRouteBackend();
      const failure: unknown = await (await getRouteBackend()).requireUser(request()).catch((error: unknown) => error);
      assert.ok(failure instanceof Response);
      assert.equal(failure.status, 503);
      assert.equal((await failure.json()).error.code, "AUTH_UNAVAILABLE");

      await client.execute('INSERT INTO "User" (id, nickname) VALUES (\'usr_persisted\', \'Private nickname\')');
      assert.equal((await endpoint(request(), context)).status, 200, "the unchanged cookie works after account storage recovers");
    });

    await t.test("missing signing configuration is a service failure; expiry and tampering remain 401", async () => {
      delete process.env.SESSION_SECRET;
      assert.equal((await endpoint(request(), context)).status, 503);
      process.env.SESSION_SECRET = "test-stable-session-key";
      assert.equal((await endpoint(request(), context)).status, 200);
      clock = now + 30 * 24 * 60 * 60 * 1000;
      assert.equal((await endpoint(request(), context)).status, 401);
      clock = now;
      assert.equal((await endpoint(request(cookie.replace("usr_persisted", "usr_other")), context)).status, 401);
      assert.equal((await endpoint(request("tb_uid=usr_persisted"), context)).status, 401);
      assert.equal((await endpoint(request(""), context)).status, 401);
    });

    await t.test("diagnostics distinguish causes without cookies, secrets, user IDs or nicknames", () => {
      const serialized = JSON.stringify(diagnostics);
      for (const reason of ["ACCOUNT_NOT_FOUND", "SIGNING_KEY_MISSING", "EXPIRED_SESSION", "INVALID_SESSION"]) assert.ok(serialized.includes(reason));
      for (const privateValue of [cookie, "test-stable-session-key", "usr_persisted", "Private nickname", url]) assert.ok(!serialized.includes(privateValue));
    });
  } finally {
    await disconnect?.();
    client.close();
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
