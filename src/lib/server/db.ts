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
  // 원격 libSQL(Turso 등, libsql://…)을 쓰면 토큰을 함께 넘긴다. 로컬 file: 은 토큰 없이 그대로.
  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;
  const adapter = new PrismaLibSql(authToken ? { url, authToken } : { url });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

const globalForPrisma = globalThis as unknown as { __kurendPrisma?: ReturnType<typeof createPrismaClient> };

/**
 * 프로세스당 클라이언트 하나만 쓴다. next dev 의 HMR 재로드와, instrumentation 과 라우트가
 * 서로 다른 번들로 db.ts 를 불러오는 경우(운영 빌드 포함) 모두 같은 연결을 공유한다.
 */
export const db = (globalForPrisma.__kurendPrisma ??= createPrismaClient());

export type Db = typeof db;
export { Prisma } from "@/generated/prisma/client";
