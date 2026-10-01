// [① 게임 코어] GET /api/runs/current?materialId= → {run: RunDto|null} (없으면 null, 404 아님)
import type { CurrentRunResponse } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";
import { findActiveRun } from "@/lib/server/run-access";
import { runInclude, toRunDto } from "@/lib/server/run-dto";

export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  const materialId = new URL(req.url).searchParams.get("materialId");
  const run = materialId
    ? await findActiveRun(user.userId, materialId)
    : await db.juniorRun.findFirst({ where: { userId: user.userId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, include: runInclude });
  const body: CurrentRunResponse = { run: run ? toRunDto(run) : null };
  return json(body);
});
