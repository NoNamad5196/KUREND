// [① 게임 코어] POST /api/runs {materialId, character, maxLives?} → RunDto (201)
import { CreateRunRequestSchema, DEFAULT_MAX_LIVES, type RunDto } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ApiError, invalidState, json, notFound, parseJson, withApi } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { findActiveRun } from "@/lib/server/run-access";
import { loadRun, toRunDto } from "@/lib/server/run-dto";

export const dynamic = "force-dynamic";

export const POST = withApi(async (req) => {
  const user = await requireUser(req);
  const body = await parseJson(req, CreateRunRequestSchema);
  const material = await db.material.findFirst({
    where: { id: body.materialId, userId: user.userId },
    select: { id: true, status: true, chapters: { select: { id: true } } },
  });
  if (!material) throw notFound("자료를 찾을 수 없습니다.");
  if (material.status !== "READY") throw invalidState("목차 생성이 끝난 자료에서만 후배를 만날 수 있습니다.");
  if (await findActiveRun(user.userId, material.id)) {
    throw new ApiError("RUN_ACTIVE", "이 자료에는 이미 가르치는 중인 후배가 있습니다.");
  }
  const maxLives = body.maxLives ?? DEFAULT_MAX_LIVES;
  const runId = newId("run");
  await db.juniorRun.create({
    data: {
      id: runId,
      userId: user.userId,
      materialId: material.id,
      character: body.character,
      lives: maxLives,
      maxLives,
      progress: { create: material.chapters.map((c) => ({ chapterId: c.id })) },
    },
  });
  const run = (await loadRun(db, runId))!;
  const res: RunDto = toRunDto(run);
  return json(res, 201);
});
