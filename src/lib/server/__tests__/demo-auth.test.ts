import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";

test("demo authentication stays local and health checks disclose no account data", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "kurend-demo-auth-"));
  const databaseUrl = `file:${join(directory, "auth.db")}`;
  const previousUrl = process.env.DATABASE_URL;
  const previousMode = process.env.NODE_ENV;
  const client = createClient({ url: databaseUrl });
  let disconnect: (() => Promise<void>) | undefined;
  try {
    await client.batch([
      'CREATE TABLE "User" (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, createdAt DATETIME NOT NULL)',
      ...["usr_demo1", "usr_demo2", "usr_demo3", "usr_google_person"].map((id) => ({
        sql: 'INSERT INTO "User" (id, nickname, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
        args: [id, id === "usr_google_person" ? "Private Google user" : id],
      })),
    ]);
    process.env.DATABASE_URL = databaseUrl;
    Reflect.set(process.env, "NODE_ENV", "test");
    const { db } = await import("@/lib/server/db");
    disconnect = () => db.$disconnect();
    const { SESSION_COOKIE } = await import("@/lib/server/auth");
    const { GET: realAccounts } = await import("@/app/api/auth/demo-accounts/route");
    const { POST: realLogin } = await import("@/app/api/auth/demo-login/route");
    const { GET: mockAccounts } = await import("@/app/api/mock/auth/demo-accounts/route");
    const { POST: mockLogin } = await import("@/app/api/mock/auth/demo-login/route");
    const { GET: health } = await import("@/app/api/health/route");
    const { store, resetStore } = await import("@/mocks/store");
    resetStore();
    store().users.push({ userId: "usr_google_person", nickname: "Private Google user", onboardingCompletedAt: null });
    const context = { params: Promise.resolve({}) };
    const request = (body?: unknown) => new Request("http://localhost/api/auth/demo-login", {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });

    await t.test("production and unset environments reject both real and mock demo endpoints", async () => {
      for (const mode of ["production", undefined]) {
        if (mode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
        else Reflect.set(process.env, "NODE_ENV", mode);
        for (const accounts of [realAccounts, mockAccounts]) {
          const response = await accounts(request(), context);
          assert.equal(response.status, 404);
          assert.equal((await response.json()).error.code, "NOT_FOUND");
        }
        for (const login of [realLogin, mockLogin]) {
          for (const body of [{ userId: "usr_demo1" }, { userId: "usr_google_person" }, {}]) {
            const response = await login(request(body), context);
            assert.equal(response.status, 404);
            assert.equal(response.headers.get("set-cookie"), null);
          }
        }
      }
    });

    await t.test("development and test expose only three seeded accounts and reject Google account login", async () => {
      for (const mode of ["development", "test"]) {
        Reflect.set(process.env, "NODE_ENV", mode);
        for (const accounts of [realAccounts, mockAccounts]) {
          const response = await accounts(request(), context);
          assert.equal(response.status, 200);
          const body = await response.json() as { userId: string; nickname: string }[];
          assert.deepEqual(body.map(({ userId }) => userId).sort(), ["usr_demo1", "usr_demo2", "usr_demo3"]);
          assert.ok(body.every((account) => Object.keys(account).sort().join(",") === "nickname,userId"));
        }
        for (const login of [realLogin, mockLogin]) {
          for (const userId of ["usr_google_person", "usr_missing"]) {
            const response = await login(request({ userId }), context);
            assert.equal(response.status, 404);
            assert.equal(response.headers.get("set-cookie"), null);
          }
          for (const userId of ["usr_demo1", "usr_demo2", "usr_demo3"]) {
            const response = await login(request({ userId }), context);
            assert.equal(response.status, 200);
            assert.ok(response.headers.get("set-cookie")?.includes(`${SESSION_COOKIE}=${userId};`));
          }
        }
      }
    });

    await t.test("production health reports DB availability without user data or internal errors", async () => {
      Reflect.set(process.env, "NODE_ENV", "production");
      const healthy = await health();
      assert.equal(healthy.status, 200);
      assert.equal(healthy.headers.get("cache-control"), "no-store");
      assert.deepEqual(await healthy.json(), { ok: true });
      await db.$disconnect();
      client.close();
      rmSync(directory, { recursive: true, force: true });
      const unavailable = await health();
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.headers.get("cache-control"), "no-store");
      assert.deepEqual(await unavailable.json(), { ok: false });
    });
    resetStore();
  } finally {
    await disconnect?.();
    client.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previousMode);
    rmSync(directory, { recursive: true, force: true });
  }
});
