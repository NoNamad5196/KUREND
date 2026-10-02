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
    await client.execute('CREATE TABLE "User" (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, onboardingCompletedAt DATETIME)');
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

    await t.test("a lost account with a valid signed cookie is restored in place (free-tier DB resets), never a false expiry", async () => {
      // 무료 호스팅은 재시작·재배포마다 DB 파일이 지워진다. 서명이 확인된 로그인은 다시 로그인시키지 않고 계정 행만 되살린다.
      await client.execute('DELETE FROM "User"');
      const response = await endpoint(request(), context);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).userId, "usr_persisted");
      assert.equal(response.headers.get("set-cookie"), null, "restoring must not replace the cookie");
      const rows = await client.execute('SELECT nickname, onboardingCompletedAt FROM "User" WHERE id = \'usr_persisted\'');
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0].nickname, "선배", "표시 이름 쿠키가 없으면 기본 닉네임");
      assert.ok(rows.rows[0].onboardingCompletedAt, "되살린 계정은 온보딩을 다시 강제하지 않는다");

      const { installLlmRouteBackend } = await import("@/lib/server/llm-backend");
      const { getRouteBackend } = await import("@/lib/llm/routes/backend");
      installLlmRouteBackend();
      assert.equal((await (await getRouteBackend()).requireUser(request())).id, "usr_persisted");

      // 표시 이름 쿠키가 있으면 그 이름으로 되살린다
      await client.execute('DELETE FROM "User"');
      assert.equal((await endpoint(request(`${cookie}; tb_name=${encodeURIComponent("Private nickname")}`), context)).status, 200);
      assert.equal((await client.execute('SELECT nickname FROM "User" WHERE id = \'usr_persisted\'')).rows[0].nickname, "Private nickname");
      assert.equal((await endpoint(request(), context)).status, 200, "the unchanged cookie keeps working afterwards");
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
