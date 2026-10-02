import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { upgradeOnboarding } from "./upgrade-onboarding.mjs";

const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;
const remote = process.env.RENDER_DB_FORCE_REMOTE === "1" || /^(libsql|https?|wss?):\/\//u.test(url); // FORCE: 로컬 파일로 원격 경로 점검용
if (!remote && (!url.startsWith("file:") || url.includes("?"))) {
  throw new Error("DATABASE_URL must be a local SQLite file: URL (no query) or a remote libsql:// URL.");
}
const databasePath = remote ? "" : resolve(url.slice("file:".length));

function runDatabaseCommand(command, databaseUrl) {
  const result = spawnSync("corepack", ["pnpm@10.30.3", command], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl, COREPACK_ENABLE_AUTO_PIN: "0" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed; demo startup stopped.`);
}

if (remote) {
  await prepareRemoteDatabase();
} else if (existsSync(databasePath)) {
  await upgradeOnboarding(url);
  // Apply additive schema changes without reseeding or accepting data loss.
  runDatabaseCommand("db:push", `file:${databasePath}`);
  console.log("Existing demo database preserved.");
} else {
  mkdirSync(dirname(databasePath), { recursive: true });
  const stagingDir = mkdtempSync(join(dirname(databasePath), ".render-init-"));
  const stagingPath = join(stagingDir, "dev.db");
  const stagingUrl = `file:${stagingPath}`;
  try {
    // Initialize with the app driver before Prisma's missing-file probe.
    const client = createClient({ url: stagingUrl });
    try {
      await client.execute("PRAGMA user_version");
    } finally {
      client.close();
    }
    for (const command of ["db:push", "db:seed"]) {
      runDatabaseCommand(command, stagingUrl);
    }
    // Publish only a fully seeded DB, and never overwrite an existing file.
    copyFileSync(stagingPath, databasePath, constants.COPYFILE_EXCL);
    console.log("New demo database initialized.");
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

/**
 * 원격 libSQL(Turso 등) — 무료 호스팅의 디스크가 재시작·재배포 때 지워져도 데이터가 남는다.
 * Prisma CLI 는 원격 libsql 에 db push 를 못 하므로, 임시 SQLite 에 스키마를 만든 뒤
 * 없는 테이블·인덱스·컬럼만 원격에 더한다. 완전히 빈 DB를 초기화할 때만 데모 시드.
 */
async function prepareRemoteDatabase() {
  const referenceDir = mkdtempSync(join(resolve("prisma"), ".remote-ref-"));
  const referenceUrl = `file:${join(referenceDir, "reference.db")}`;
  const reference = createClient({ url: referenceUrl });
  const target = createClient({ url, authToken });
  try {
    await reference.execute("PRAGMA user_version");
    runDatabaseCommand("db:push", referenceUrl);
    const objects = async (client) => (await client.execute(
      "SELECT type, name, tbl_name AS tableName, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'",
    )).rows;
    const initialObjects = await objects(target);
    const pristine = initialObjects.length === 0;
    // Preserve pre-onboarding users before generic nullable-column additions.
    await upgradeOnboarding(url);
    const wanted = await objects(reference);
    const existing = new Set((await objects(target)).map((row) => `${row.type}:${row.name}`));
    const statements = [];
    for (const table of wanted.filter((row) => row.type === "table")) {
      if (!existing.has(`table:${table.name}`)) { statements.push(table.sql); continue; }
      const have = new Set((await target.execute(`PRAGMA table_info("${table.name}")`)).rows.map((column) => column.name));
      for (const column of (await reference.execute(`PRAGMA table_info("${table.name}")`)).rows) {
        if (have.has(column.name)) continue;
        if (column.notnull && column.dflt_value === null) {
          throw new Error(`[render-db] ${table.name}.${column.name}: 기본값 없는 필수 컬럼은 별도 데이터 마이그레이션이 필요합니다.`);
        }
        statements.push(`ALTER TABLE "${table.name}" ADD COLUMN "${column.name}" ${column.type}${column.dflt_value !== null ? ` DEFAULT ${column.dflt_value}` : ""}${column.notnull ? " NOT NULL" : ""}`);
      }
    }
    for (const index of wanted.filter((row) => row.type === "index")) {
      if (!existing.has(`index:${index.name}`)) statements.push(index.sql);
    }
    for (const statement of statements) await target.execute(statement);
    console.log(`Remote database ready (${statements.length} additive schema change(s)).`);
    if (pristine) {
      runDatabaseCommand("db:seed", url);
      console.log("Remote database seeded with demo data.");
    }
  } finally {
    reference.close();
    target.close();
    rmSync(referenceDir, { recursive: true, force: true });
  }
}
