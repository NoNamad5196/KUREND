import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";

test("Google callback opens onboarding only when creating an account", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "kurend-google-onboarding-"));
  const url = `file:${join(directory, "oauth.db")}`;
  const envKeys = ["DATABASE_URL", "NODE_ENV", "APP_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "NEXT_PUBLIC_GOOGLE_CLIENT_ID"] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const client = createClient({ url });
  await client.execute("PRAGMA user_version");
  client.close();
  for (const key of envKeys) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, {
    DATABASE_URL: url,
    NODE_ENV: "test",
    APP_URL: "https://kurend.test",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
  });
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const pushed = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: url },
    });
    assert.equal(pushed.status, 0, pushed.stderr);
    const { db } = await import("@/lib/server/db");
    disconnect = () => db.$disconnect();
    const { GET: callback } = await import("@/app/api/auth/google/callback/route");
    const { SESSION_COOKIE } = await import("@/lib/server/auth");
    const { OAUTH_STATE_COOKIE, googleUserId } = await import("@/lib/server/google-oauth");
    const state = "valid-oauth-state";
    let profile = { sub: "first-account", name: "첫 선배", email: "first@example.test" };
    let tokenStatus = 200;
    let userinfoStatus = 200;
    const fetched: string[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const endpoint = input instanceof Request ? input.url : String(input);
      fetched.push(endpoint);
      if (endpoint === "https://oauth2.googleapis.com/token") {
        assert.equal(init?.method, "POST");
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get("code"), "test-code");
        assert.equal(body.get("client_id"), "test-client");
        return Response.json({ access_token: "test-access-token" }, { status: tokenStatus });
      }
      if (endpoint === "https://www.googleapis.com/oauth2/v3/userinfo") {
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-access-token");
        return Response.json(profile, { status: userinfoStatus });
      }
      throw new Error(`Unexpected fetch: ${endpoint}`);
    });
    const request = (query = `code=test-code&state=${state}`, cookie = `${OAUTH_STATE_COOKIE}=${state}`) =>
      new Request(`https://kurend.test/api/auth/google/callback?${query}`, { headers: { cookie } });
    function assertSuccess(response: Response, path: string, id: string) {
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), `https://kurend.test${path}`);
      const cookies = response.headers.get("set-cookie") ?? "";
      assert.ok(cookies.includes(`${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=`));
      assert.ok(cookies.includes(`${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`));
    }
    function assertFailure(response: Response, reason: string) {
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), `https://kurend.test/login?error=${reason}`);
      const cookies = response.headers.get("set-cookie") ?? "";
      assert.ok(cookies.includes(`${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`));
      assert.ok(!cookies.includes(`${SESSION_COOKIE}=`), "a failed callback must not create a session");
    }
    const firstId = googleUserId(profile.sub);

    await t.test("new signup creates a pending account and opens onboarding", async () => {
      assertSuccess(await callback(request()), "/onboarding?mode=signup", firstId);
      const user = await db.user.findUniqueOrThrow({ where: { id: firstId } });
      assert.equal(user.nickname, "첫 선배");
      assert.equal(user.onboardingCompletedAt, null);
      assert.equal(await db.user.count(), 1);
      assert.deepEqual(fetched, ["https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v3/userinfo"]);
    });

    await t.test("returning unfinished account goes home and still refreshes its nickname", async () => {
      profile = { ...profile, name: "바뀐 이름" };
      assertSuccess(await callback(request()), "/", firstId);
      const user = await db.user.findUniqueOrThrow({ where: { id: firstId } });
      assert.equal(user.nickname, "바뀐 이름");
      assert.equal(user.onboardingCompletedAt, null);
      assert.equal(await db.user.count(), 1);
    });

    await t.test("returning completed account goes home and preserves completion", async () => {
      const completedAt = new Date("2026-01-02T03:04:05.000Z");
      await db.user.update({ where: { id: firstId }, data: { onboardingCompletedAt: completedAt } });
      assertSuccess(await callback(request()), "/", firstId);
      const user = await db.user.findUniqueOrThrow({ where: { id: firstId } });
      assert.equal(user.onboardingCompletedAt?.getTime(), completedAt.getTime());
    });

    await t.test("another new Google identity receives its own first signup onboarding", async () => {
      profile = { sub: "second-account", name: "다른 선배", email: "second@example.test" };
      const secondId = googleUserId(profile.sub);
      assertSuccess(await callback(request()), "/onboarding?mode=signup", secondId);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: secondId } })).onboardingCompletedAt, null);
      assert.equal(await db.user.count(), 2);
    });

    await t.test("invalid state and cancelled login cannot fetch profiles or create accounts", async () => {
      const beforeFetches = fetched.length;
      assertFailure(await callback(request("code=test-code&state=wrong")), "google_state");
      assertFailure(await callback(request(`code=test-code&state=${state}`, "")), "google_state");
      assertFailure(await callback(request(`state=${state}`)), "google_state");
      assertFailure(await callback(request("error=access_denied")), "google_denied");
      assert.equal(fetched.length, beforeFetches);
      assert.equal(await db.user.count(), 2);
    });

    await t.test("provider failures keep failure redirects and do not create an account", async (failureTest) => {
      failureTest.mock.method(console, "error", () => {});
      profile = { sub: "failed-account", name: "실패 계정", email: "failed@example.test" };
      tokenStatus = 503;
      assertFailure(await callback(request()), "google_failed");
      tokenStatus = 200;
      userinfoStatus = 503;
      assertFailure(await callback(request()), "google_failed");
      userinfoStatus = 200;
      assert.equal(await db.user.findUnique({ where: { id: googleUserId(profile.sub) } }), null);
      assert.equal(await db.user.count(), 2);
    });

    await t.test("unconfigured OAuth rejects login before any external exchange", async () => {
      const beforeFetches = fetched.length;
      delete process.env.GOOGLE_CLIENT_SECRET;
      assertFailure(await callback(request()), "google_unavailable");
      assert.equal(fetched.length, beforeFetches);
    });
  } finally {
    await disconnect?.();
    for (const [key, previous] of previousEnv) {
      if (previous === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, previous);
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
