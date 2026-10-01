// [C] GET /api/materials/{id} → §5-4-1 / DELETE → {ok:true}
import type { OkResponse } from "@/contracts/types";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, notFound, withApi } from "@/lib/server/http";
import { materialInclude, toMaterialDto } from "@/lib/server/material-dto";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const material = await db.material.findFirst({
    where: { id: params.id, userId: user.userId },
    include: materialInclude,
  });
  if (!material) throw notFound("자료를 찾을 수 없습니다.");
  return json(toMaterialDto(material));
});

export const DELETE = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const material = await db.material.findFirst({ where: { id: params.id, userId: user.userId }, select: { id: true } });
  if (!material) throw notFound("자료를 찾을 수 없습니다.");
  // Source/Chapter/Session… 은 onDelete: Cascade. Chapter → Source 관계만 명시 삭제 순서를 맞춘다.
  await db.$transaction(async (tx) => {
    await tx.chapter.deleteMany({ where: { materialId: material.id } });
    await tx.material.delete({ where: { id: material.id } });
  });
  const body: OkResponse = { ok: true };
  return json(body);
});
