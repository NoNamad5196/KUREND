import assert from "node:assert/strict";
import { test } from "node:test";
import { clearSessionCookieHeader, getUserIdFromRequest, SESSION_COOKIE, sessionCookieHeader } from "@/lib/server/auth";

test("production sessions authenticate signed, unexpired cookies only", async (t) => {
  const keys = ["NODE_ENV", "SESSION_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  const request = (cookie: string) => new Request("https://kurend.test/api/auth/me", { headers: { cookie } });
  const authenticated = (value: string) => getUserIdFromRequest(request(`${SESSION_COOKIE}=${value}`));
  const cookieValue = (header: string) => decodeURIComponent(header.split(";")[0].slice(SESSION_COOKIE.length + 1));
  const reset = (mode: string | undefined, secret?: string) => {
    for (const key of keys) Reflect.deleteProperty(process.env, key);
    if (mode !== undefined) Reflect.set(process.env, "NODE_ENV", mode);
    if (secret) process.env.SESSION_SECRET = secret;
  };
  try {
    await t.test("valid signature round trips and production cookies use Secure, HttpOnly and expiry", () => {
      reset("production", "unit-test-session-secret");
      const header = sessionCookieHeader("usr_member");
      assert.match(header, /; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
      const value = cookieValue(header);
      assert.match(value, /^v1\.usr_member\.\d+\.[A-Za-z0-9_-]{43}$/);
      assert.equal(Number(value.split(".")[2]), now / 1000 + 2592000);
      assert.equal(authenticated(value), "usr_member");
      assert.match(clearSessionCookieHeader(), /Max-Age=0; Secure$/);
    });

    await t.test("unsigned users and modified identity, expiry, version or signature are rejected", () => {
      reset("production", "unit-test-session-secret");
      const value = cookieValue(sessionCookieHeader("usr_member"));
      const [version, userId, expiry, signature] = value.split(".");
      for (const invalid of [
        "usr_member", "usr_demo1", value.replace(userId, "usr_other"),
        `${version}.${userId}.${Number(expiry) + 1}.${signature}`,
        value.replace("v1.", "v2."), `${value}.extra`,
        `${version}.${userId}.${expiry}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`,
        `${version}.${userId}.${expiry}.${signature.slice(0, -1)}`,
        `${version}.${userId}.NaN.${signature}`, `${version}.${userId}.${expiry}.%%%`,
        "%E0%A4%A", "", "v1.usr_member.1.x",
      ]) assert.equal(authenticated(invalid), null, "malformed or tampered cookies must not authenticate");
      assert.throws(() => sessionCookieHeader("not-a-user"), /올바르지 않은 세션 사용자/);
    });

    await t.test("server expiry is enforced at the boundary even if a client retains the cookie", (expiryTest) => {
      reset("production", "unit-test-session-secret");
      const value = cookieValue(sessionCookieHeader("usr_member"));
      expiryTest.mock.method(Date, "now", () => now + 2592000 * 1000 - 1);
      assert.equal(authenticated(value), "usr_member");
      expiryTest.mock.method(Date, "now", () => now + 2592000 * 1000);
      assert.equal(authenticated(value), null);
    });

    await t.test("key preference and Google aliases are stable, and rotation invalidates old sessions", () => {
      reset("production");
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = "unit-test-google-alias";
      const aliasCookie = cookieValue(sessionCookieHeader("usr_member"));
      assert.equal(authenticated(aliasCookie), "usr_member");
      process.env.GOOGLE_CLIENT_SECRET = "unit-test-google-primary";
      assert.equal(authenticated(aliasCookie), null);
      const googleCookie = cookieValue(sessionCookieHeader("usr_member"));
      assert.equal(authenticated(googleCookie), "usr_member");
      process.env.SESSION_SECRET = "unit-test-explicit-session";
      assert.equal(authenticated(googleCookie), null);
      const sessionCookie = cookieValue(sessionCookieHeader("usr_member"));
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      assert.equal(authenticated(sessionCookie), "usr_member");
    });

    await t.test("missing secrets fail closed in production and an unspecified environment", () => {
      for (const mode of ["production", undefined]) {
        reset(mode);
        assert.equal(authenticated("usr_demo1"), null);
        assert.equal(authenticated("v1.usr_member.9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), null);
        assert.throws(() => sessionCookieHeader("usr_member"), /세션 서명 키가 설정되지 않았습니다/);
      }
    });

    await t.test("development and test fixture cookies keep their existing behavior", () => {
      for (const mode of ["development", "test"]) {
        reset(mode);
        assert.equal(authenticated("usr_demo1"), "usr_demo1");
        assert.equal(authenticated("usr_google_fixture"), "usr_google_fixture");
        assert.match(sessionCookieHeader("usr_demo1"), new RegExp(`^${SESSION_COOKIE}=usr_demo1;`));
        assert.ok(!sessionCookieHeader("usr_demo1").includes("Secure"));
        assert.ok(!clearSessionCookieHeader().includes("Secure"));
        assert.equal(authenticated("invalid-id"), null);
      }
    });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
});
