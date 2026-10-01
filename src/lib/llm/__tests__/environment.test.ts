import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("CLI local environment loads quoted values while explicit process settings win", () => {
  const directory = mkdtempSync(join(tmpdir(), "llm-env-test-"));
  try {
    const path = join(directory, ".env");
    writeFileSync(path, 'LLM_ENV_TEST_LOCAL="local value"\nLLM_ENV_TEST_OVERRIDE=from-file\n');
    const modulePath = join(process.cwd(), "src/lib/llm/environment.ts");
    const code = `const { loadLocalEnvironment } = require(${JSON.stringify(modulePath)}); loadLocalEnvironment(${JSON.stringify(path)}); loadLocalEnvironment(${JSON.stringify(join(directory, "absent"))}); process.stdout.write(JSON.stringify([process.env.LLM_ENV_TEST_LOCAL, process.env.LLM_ENV_TEST_OVERRIDE]));`;
    const child = spawnSync(process.execPath, ["--import", "tsx", "-e", code], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, LLM_ENV_TEST_OVERRIDE: "explicit" },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), ["local value", "explicit"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
