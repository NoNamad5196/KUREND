import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";

/**
 * db:push 저장소의 비파괴 업그레이드. 이전 사용자만 자동 온보딩에서 제외한다.
 * 컬럼 추가와 backfill은 한 트랜잭션이므로 중간 실패/재실행 시 신규 사용자를 덮어쓰지 않는다.
 * 새 DB는 Prisma가 만들고, 새 User는 nullable 기본값(null)을 사용한다.
 */
export async function upgradeOnboarding(url) {
  if (url.startsWith("file:") && !existsSync(resolve(url.slice(5)))) return;
  const client = createClient({ url });
  let transaction;
  try {
    transaction = await client.transaction("write");
    const users = await transaction.execute('PRAGMA table_info("User")');
    if (users.rows.length && !users.rows.some((column) => column.name === "onboardingCompletedAt")) {
      await transaction.execute('ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" DATETIME');
      await transaction.execute({
        sql: 'UPDATE "User" SET "onboardingCompletedAt" = ? WHERE "onboardingCompletedAt" IS NULL',
        args: [new Date().toISOString()],
      });
    }
    const messages = await transaction.execute('PRAGMA table_info("Message")');
    if (messages.rows.length && !messages.rows.some((column) => column.name === "teachingChoicesJson")) {
      await transaction.execute('ALTER TABLE "Message" ADD COLUMN "teachingChoicesJson" TEXT');
    }
    await transaction.commit();
  } catch (error) {
    await transaction?.rollback();
    throw error;
  } finally {
    transaction?.close();
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // db:push는 Prisma의 .env, dev/start는 Next의 환경 파일 우선순위와 맞춘다.
  // 명시적으로 주입된 DATABASE_URL은 어느 경우에도 덮어쓰지 않는다.
  const runtime = process.argv.find((arg) => arg.startsWith("--runtime="))?.slice(10);
  const mode = process.env.NODE_ENV || runtime;
  const files = runtime ? [`.env.${mode}.local`, ...(mode === "test" ? [] : [".env.local"]), `.env.${mode}`, ".env"] : [".env"];
  for (const file of files) if (existsSync(file)) loadEnvFile(file);
  upgradeOnboarding(process.env.DATABASE_URL || "file:./prisma/dev.db").catch((error) => {
    console.error("Additive database upgrade failed:", error);
    process.exitCode = 1;
  });
}
