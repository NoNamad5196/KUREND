import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createClient } from "@libsql/client";

// Exercise the remote initializer against disposable local libSQL files only.
// No configured deployment URL or authentication token reaches these children.
const directory = mkdtempSync(join(tmpdir(), "kurend-render-db-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const urlFor = (name) => `file:${join(directory, `${name}.db`)}`;
const initialize = (url, { remote = true, success = true } = {}) => {
  assert.ok(url.startsWith(`file:${directory}/`));
  const result = spawnSync(process.execPath, ["scripts/render-db.mjs"], {
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: url,
      DATABASE_AUTH_TOKEN: "",
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      RENDER_DB_FORCE_REMOTE: remote ? "1" : "0",
      NODE_ENV: "test",
      COREPACK_ENABLE_AUTO_PIN: "0",
    },
  });
  if (success) assert.equal(result.status, 0, result.stderr || result.stdout);
  else assert.notEqual(result.status, 0);
  return result;
};
const withClient = async (url, callback) => {
  const client = createClient({ url });
  try { return await callback(client); }
  finally { client.close(); }
};
const userRows = (client) => client.execute('SELECT * FROM "User" ORDER BY id');
const legacyUser = 'CREATE TABLE "User" (id TEXT PRIMARY KEY NOT NULL, nickname TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)';

test("a pristine remote database is initialized and seeded once", async () => {
  const url = urlFor("pristine");
  initialize(url);
  await withClient(url, async (client) => {
    assert.deepEqual((await userRows(client)).rows.map((row) => row.id), ["usr_demo1", "usr_demo2", "usr_demo3"]);
    assert.ok(Number((await client.execute('SELECT COUNT(*) AS count FROM "Material"')).rows[0].count) > 0);
  });
});

test("remote restart preserves existing users and learning data instead of reseeding", async () => {
  const url = urlFor("preserved");
  initialize(url);
  let before;
  await withClient(url, async (client) => {
    await client.execute('INSERT INTO "User" (id, nickname) VALUES (\'usr_preserved\', \'saved account\')');
    await client.execute('UPDATE "Material" SET title = \'saved learning progress\' WHERE id = (SELECT id FROM "Material" LIMIT 1)');
    before = { users: (await userRows(client)).rows, materials: (await client.execute('SELECT * FROM "Material" ORDER BY id')).rows };
  });
  initialize(url);
  await withClient(url, async (client) => {
    assert.deepEqual({ users: (await userRows(client)).rows, materials: (await client.execute('SELECT * FROM "Material" ORDER BY id')).rows }, before);
  });
});

test("an existing database with zero users is never considered safe to reseed", async () => {
  const url = urlFor("empty-users");
  await withClient(url, async (client) => {
    await client.execute(legacyUser);
    await client.execute('CREATE TABLE "SavedMarker" (value TEXT NOT NULL)');
    await client.execute('INSERT INTO "SavedMarker" VALUES (\'preserve this record\')');
  });
  initialize(url);
  await withClient(url, async (client) => {
    assert.equal((await userRows(client)).rows.length, 0);
    assert.equal((await client.execute('SELECT value FROM "SavedMarker"')).rows[0].value, "preserve this record");
  });
});

test("remote additive upgrade backfills old onboarding once and leaves new users pending", async () => {
  const url = urlFor("legacy");
  await withClient(url, async (client) => {
    await client.execute(legacyUser);
    await client.execute('INSERT INTO "User" (id, nickname) VALUES (\'usr_old\', \'old account\')');
  });
  initialize(url);
  let completedAt;
  await withClient(url, async (client) => {
    completedAt = (await userRows(client)).rows[0].onboardingCompletedAt;
    assert.ok(completedAt);
    await client.execute('INSERT INTO "User" (id, nickname) VALUES (\'usr_new\', \'new account\')');
  });
  initialize(url);
  await withClient(url, async (client) => {
    const rows = (await userRows(client)).rows;
    assert.equal(rows.find((row) => row.id === "usr_old").onboardingCompletedAt, completedAt);
    assert.equal(rows.find((row) => row.id === "usr_new").onboardingCompletedAt, null);
    const columns = (await client.execute('PRAGMA table_info("Message")')).rows;
    assert.ok(columns.some((column) => column.name === "teachingChoicesJson"));
  });
});

test("unsupported required-column migration stops startup without erasing existing data", async () => {
  const url = urlFor("unsupported");
  await withClient(url, async (client) => {
    await client.execute('CREATE TABLE "User" (id TEXT PRIMARY KEY NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    await client.execute('INSERT INTO "User" (id) VALUES (\'usr_keep\')');
  });
  const result = initialize(url, { success: false });
  assert.match(result.stderr, /User\.nickname/);
  await withClient(url, async (client) => {
    assert.deepEqual((await userRows(client)).rows.map((row) => row.id), ["usr_keep"]);
  });
});

test("local initialization and restart continue preserving existing account data", async () => {
  const url = urlFor("local");
  initialize(url, { remote: false });
  let before;
  await withClient(url, async (client) => {
    await client.execute('UPDATE "User" SET nickname = \'local saved account\' WHERE id = \'usr_demo1\'');
    before = (await userRows(client)).rows;
  });
  initialize(url, { remote: false });
  await withClient(url, async (client) => assert.deepEqual((await userRows(client)).rows, before));
});
