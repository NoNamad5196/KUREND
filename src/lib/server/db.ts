/**
 * [C 소유, FROZEN] Prisma 싱글턴.
 * Prisma 7 + SQLite 는 driver adapter 가 필수 → @prisma/adapter-libsql (빌드 스크립트·네이티브 컴파일 없음).
 * DATABASE_URL 은 프로젝트 루트 기준 상대경로. 기본값 file:./prisma/dev.db (prisma.config.ts 와 동일).
 *
 * 사용: import { db } from "@/lib/server/db";
 */
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

export const DEFAULT_DATABASE_URL = "file:./prisma/dev.db";

function createPrismaClient() {
  const url = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

const globalForPrisma = globalThis as unknown as { __kurendPrisma?: ReturnType<typeof createPrismaClient> };

/** next dev 의 HMR 로 모듈이 다시 로드돼도 연결을 하나만 유지한다. */
export const db = globalForPrisma.__kurendPrisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__kurendPrisma = db;

export type Db = typeof db;
export { Prisma } from "@/generated/prisma/client";
