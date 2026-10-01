import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";

// A valid cookie cannot restore lost account/history data or turn a nickname cookie into an identity.
test("lost accounts remain unavailable until storage is restored; cookies never recreate accounts", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "kurend-session-restore-"));
  const url = `file:${join(directory, "restore.db")}`;
  const keys = ["DATABASE_URL", "NODE_ENV", "SESSION_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const client = createClient({ url });
  await client.execute("PRAGMA user_version");
  client.close();
  for (const key of keys) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, { DATABASE_URL: url, NODE_ENV: "production", SESSION_SECRET: "restore-test-secret" });
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const pushed = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: url },
    });
    assert.equal(pushed.status, 0, pushed.stderr);
    const { db } = await import("@/lib/server/db");
    disconnect = () => db.$disconnect();
    const { requireUser, sessionCookieHeader, SESSION_COOKIE } = await import("@/lib/server/auth");
    t.mock.method(console, "error", () => {});
    t.mock.method(console, "warn", () => {});
    const cookieOf = (header: string) => header.split(";")[0];
    const request = (cookie: string) => new Request("https://kurend.test/api/auth/me", { headers: { cookie } });

    const signed = cookieOf(sessionCookieHeader("usr_google_abc"));
    const name = `tb_name=${encodeURIComponent("untrusted nickname")}`;
    assert.equal(await db.user.count(), 0, "DB 가 막 초기화된 상태");

    await assert.rejects(requireUser(request(`${signed}; ${name}`)), (error: { status?: number; code?: string }) => error.status === 503 && error.code === "AUTH_UNAVAILABLE");
    assert.equal(await db.user.count(), 0, "a nickname cookie must not resurrect the account or invent completion history");

    const completedAt = new Date("2026-01-02T03:04:05Z");
    await db.user.create({ data: { id: "usr_google_abc", nickname: "복원된 선배", onboardingCompletedAt: completedAt } });
    const user = await requireUser(request(`${signed}; ${name}`));
    assert.equal(user.userId, "usr_google_abc");
    assert.equal(user.nickname, "복원된 선배", "untrusted display cookies cannot overwrite stored identity");
    assert.equal(user.onboardingCompletedAt?.getTime(), completedAt.getTime());

    // 두 번째 요청은 그대로 같은 계정
    assert.equal((await requireUser(request(signed))).userId, "usr_google_abc");
    assert.equal(await db.user.count(), 1);

    // 서명이 틀리거나 평문 ID 인 쿠키로는 계정을 만들 수 없다
    const forged = signed.replace(/.$/u, (c) => (c === "A" ? "B" : "A"));
    await assert.rejects(requireUser(request(forged)), (error: { status?: number }) => error.status === 401);
    await assert.rejects(requireUser(request(`${SESSION_COOKIE}=usr_plain_id`)), (error: { status?: number }) => error.status === 401);
    assert.equal(await db.user.count(), 1);
  } finally {
    await disconnect?.();
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
