/**
 * [① 게임 코어] Run 조회 + 소유자 검증.
 *   const { user, run } = await loadOwnedRun(req, id);   // 남의 Run 은 404 NO_RUN
 */
import { requireUser, type AuthUser } from "@/lib/server/auth";
import { db, type Prisma } from "@/lib/server/db";
import { ApiError } from "@/lib/server/http";
import { runInclude, type RunWithRelations } from "@/lib/server/run-dto";

export const noRun = (message = "후배 기록(Run)을 찾을 수 없습니다.") => new ApiError("NO_RUN", message);

export async function findActiveRun(userId: string, materialId: string, client: Prisma.TransactionClient | typeof db = db) {
  return client.juniorRun.findFirst({
    where: { userId, materialId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    include: runInclude,
  });
}

export async function loadOwnedRun(req: Request, runId: string): Promise<{ user: AuthUser; run: RunWithRelations }> {
  const user = await requireUser(req);
  const run = await db.juniorRun.findFirst({ where: { id: runId, userId: user.userId }, include: runInclude });
  if (!run) throw noRun();
  return { user, run };
}
