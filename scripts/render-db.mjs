import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { upgradeOnboarding } from "./upgrade-onboarding.mjs";

const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
if (!url.startsWith("file:") || url.includes("?")) {
  throw new Error("The Render demo requires a local SQLite DATABASE_URL without query parameters.");
}
const databasePath = resolve(url.slice("file:".length));

if (existsSync(databasePath)) {
  await upgradeOnboarding(url);
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
      const result = spawnSync("corepack", ["pnpm@10.30.3", command], {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: stagingUrl, COREPACK_ENABLE_AUTO_PIN: "0" },
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`${command} failed; demo startup stopped.`);
    }
    // Publish only a fully seeded DB, and never overwrite an existing file.
    copyFileSync(stagingPath, databasePath, constants.COPYFILE_EXCL);
    console.log("New demo database initialized.");
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}
