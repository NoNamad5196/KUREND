// [C] GET /api/sources/{id}/content → {sourceId, fileName, text}
import type { SourceContentDto } from "@/contracts/types";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, notFound, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const source = await db.source.findFirst({
    where: { id: params.id, material: { userId: user.userId } },
    select: { id: true, fileName: true, text: true },
  });
  if (!source) throw notFound("자료 원문을 찾을 수 없습니다.");
  const body: SourceContentDto = { sourceId: source.id, fileName: source.fileName, text: source.text };
  return json(body);
});
