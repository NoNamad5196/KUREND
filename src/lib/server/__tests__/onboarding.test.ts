import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { MeSchema } from "@/contracts/types";
import { upgradeOnboarding } from "../../../../scripts/upgrade-onboarding.mjs";

test("additive upgrade preserves old users/messages and never backfills users created after rollout", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kurend-onboarding-upgrade-"));
  const url = `file:${join(directory, "legacy.db")}`;
  const client = createClient({ url });
  try {
    await client.batch([
      'CREATE TABLE "User" (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, createdAt DATETIME NOT NULL)',
      'CREATE TABLE "Message" (id TEXT PRIMARY KEY, content TEXT NOT NULL)',
      'INSERT INTO "User" VALUES (\'usr_existing\', \'기존 선배\', \'2025-01-01T00:00:00.000Z\')',
      'INSERT INTO "Message" VALUES (\'msg_existing\', \'내가 가르친 내용\')',
    ]);
    await upgradeOnboarding(url);
    const oldUser = (await client.execute('SELECT nickname, onboardingCompletedAt FROM "User" WHERE id = \'usr_existing\'')).rows[0];
    assert.equal(oldUser.nickname, "기존 선배");
    assert.ok(oldUser.onboardingCompletedAt);
    const message = (await client.execute('SELECT content, teachingChoicesJson FROM "Message"')).rows[0];
    assert.equal(message.content, "내가 가르친 내용");
    assert.equal(message.teachingChoicesJson, null);

    await client.execute('INSERT INTO "User" (id, nickname, createdAt) VALUES (\'usr_new\', \'새 선배\', CURRENT_TIMESTAMP)');
    const choices = JSON.stringify([{ id: "c1", text: "선배의 설명" }]);
    await client.execute({ sql: 'UPDATE "Message" SET teachingChoicesJson = ?', args: [choices] });
    await upgradeOnboarding(url);
    assert.equal((await client.execute('SELECT onboardingCompletedAt FROM "User" WHERE id = \'usr_existing\'')).rows[0].onboardingCompletedAt, oldUser.onboardingCompletedAt);
    assert.equal((await client.execute('SELECT onboardingCompletedAt FROM "User" WHERE id = \'usr_new\'')).rows[0].onboardingCompletedAt, null);
    assert.equal((await client.execute('SELECT teachingChoicesJson FROM "Message"')).rows[0].teachingChoicesJson, choices);
  } finally {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fresh schema keeps every new account pending even after repeated startup upgrades", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kurend-onboarding-fresh-"));
  const url = `file:${join(directory, "fresh.db")}`;
  const client = createClient({ url });
  try {
    await client.execute('CREATE TABLE "User" (id TEXT PRIMARY KEY, onboardingCompletedAt DATETIME)');
    await client.execute('INSERT INTO "User" (id) VALUES (\'usr_new\')');
    await upgradeOnboarding(url);
    await upgradeOnboarding(url);
    assert.equal((await client.execute('SELECT onboardingCompletedAt FROM "User"')).rows[0].onboardingCompletedAt, null);
  } finally {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("mock auth uses the same onboarding contract for seeded existing and first-use accounts", async () => {
  const { resetStore, getUser } = await import("@/mocks/store");
  const { COOKIE } = await import("@/mocks/auth");
  const { GET: me } = await import("@/app/api/mock/auth/me/route");
  const { POST: complete } = await import("@/app/api/mock/auth/onboarding/route");
  resetStore();
  const context = { params: Promise.resolve({}) };
  const request = (id?: string) => new Request("http://localhost/api/mock/auth/me", { headers: id ? { cookie: `${COOKIE}=${id}` } : {} });
  try {
    assert.equal((await complete(request(), context)).status, 401);
    assert.equal(MeSchema.parse(await (await me(request("usr_demo1"), context)).json()).onboardingCompleted, true);
    assert.equal(MeSchema.parse(await (await me(request("usr_demo2"), context)).json()).onboardingCompleted, false);
    await complete(request("usr_demo2"), context);
    const first = getUser("usr_demo2")!.onboardingCompletedAt;
    await complete(request("usr_demo2"), context);
    assert.equal(getUser("usr_demo2")!.onboardingCompletedAt, first);
    assert.equal(MeSchema.parse(await (await me(request("usr_demo2"), context)).json()).onboardingCompleted, true);
    assert.equal(MeSchema.parse(await (await me(request("usr_demo3"), context)).json()).onboardingCompleted, false);
  } finally {
    resetStore();
  }
});

test("real auth routes persist onboarding per account across logout/login and preserve the first completion", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kurend-onboarding-api-"));
  const url = `file:${join(directory, "api.db")}`;
  const previousUrl = process.env.DATABASE_URL;
  const previousMode = process.env.NODE_ENV;
  // Initialize the file before the Prisma schema engine probes its path.
  const client = createClient({ url });
  await client.execute("PRAGMA user_version");
  client.close();
  process.env.DATABASE_URL = url;
  Reflect.set(process.env, "NODE_ENV", "test");
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const pushed = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: url },
    });
    assert.equal(pushed.status, 0, pushed.stderr);
    const { db } = await import("@/lib/server/db");
    disconnect = () => db.$disconnect();
    const { SESSION_COOKIE } = await import("@/lib/server/auth");
    const { GET: me } = await import("@/app/api/auth/me/route");
    const { POST: complete } = await import("@/app/api/auth/onboarding/route");
    const { POST: login } = await import("@/app/api/auth/demo-login/route");
    const { POST: logout } = await import("@/app/api/auth/logout/route");
    await db.user.createMany({ data: [{ id: "usr_demo2", nickname: "새 선배" }, { id: "usr_other", nickname: "다른 선배" }] });
    const context = { params: Promise.resolve({}) };
    const request = (path: string, userId?: string, body?: unknown) => new Request(`http://localhost/api/auth/${path}`, {
      method: path === "me" ? "GET" : "POST",
      headers: userId ? { cookie: `${SESSION_COOKIE}=${userId}`, "Content-Type": "application/json" } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal((await complete(request("onboarding"), context)).status, 401);
    assert.equal((await complete(request("onboarding", "usr_missing"), context)).status, 401);
    assert.equal(MeSchema.parse(await (await me(request("me", "usr_demo2"), context)).json()).onboardingCompleted, false);

    const result = await complete(request("onboarding", "usr_demo2", { userId: "usr_other" }), context);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true });
    const first = await db.user.findUniqueOrThrow({ where: { id: "usr_demo2" } });
    assert.ok(first.onboardingCompletedAt);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: "usr_other" } })).onboardingCompletedAt, null, "request bodies cannot complete another account");
    await complete(request("onboarding", "usr_demo2"), context);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: "usr_demo2" } })).onboardingCompletedAt?.getTime(), first.onboardingCompletedAt.getTime());

    const loggedOut = await logout(request("logout", "usr_demo2"), context);
    assert.match(loggedOut.headers.get("set-cookie") ?? "", /Max-Age=0/);
    assert.equal((await me(request("me"), context)).status, 401);
    const loggedIn = await login(request("demo-login", undefined, { userId: "usr_demo2" }), context);
    assert.match(loggedIn.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE}=usr_demo2`));
    const refreshed = MeSchema.parse(await (await me(request("me", "usr_demo2"), context)).json());
    assert.equal(refreshed.onboardingCompleted, true);
    assert.equal(refreshed.nickname, "새 선배");
    assert.equal(MeSchema.parse(await (await me(request("me", "usr_other"), context)).json()).onboardingCompleted, false);
  } finally {
    await disconnect?.();
    if (previousMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previousMode);
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    rmSync(directory, { recursive: true, force: true });
  }
});
