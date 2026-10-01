/**
 * [C 소유] Prisma 7 설정 파일.
 * Prisma 7부터 datasource url은 schema.prisma가 아니라 이 파일에서 지정한다.
 * CLI는 .env를 자동으로 읽지 않으므로(의존성 추가 없이) 여기서 직접 읽는다.
 * 상대경로는 프로젝트 루트(이 파일의 위치) 기준이다. 기본값: file:./prisma/dev.db
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

function loadDotEnv(file: string) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = value.match(/^(["'])(.*?)\1/);
    if (quoted) value = quoted[2];
    else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(resolve(process.cwd(), ".env"));

export const DEFAULT_DATABASE_URL = "file:./prisma/dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL || DEFAULT_DATABASE_URL },
});
