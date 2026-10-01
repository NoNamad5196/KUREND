// [C] POST /api/sessions/{id}/gaps/{gapId}/reviewed → {gapId, status:"REVIEWED", remaining}
//     RESULT_READY → REVIEWING 전이. 이미 REVIEWED 면 그대로 200.
import type { ReviewedResponse } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { json, notFound, withApi } from "@/lib/server/http";
import { assertStatus, loadOwnedSession } from "@/lib/server/session-access";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string; gapId: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  assertStatus(session, ["RESULT_READY", "REVIEWING"], "되짚기");
  const gap = session.gaps.find((g) => g.id === params.gapId);
  if (!gap) throw notFound("놓친 곳을 찾을 수 없습니다.");

  await db.$transaction(async (tx) => {
    if (gap.status !== "REVIEWED") await tx.gap.update({ where: { id: gap.id }, data: { status: "REVIEWED" } });
    if (session.status !== "REVIEWING") await tx.session.update({ where: { id: session.id }, data: { status: "REVIEWING" } });
  });

  const remaining = session.gaps.filter((g) => g.id !== gap.id && g.status !== "REVIEWED").length;
  const body: ReviewedResponse = { gapId: gap.id, status: "REVIEWED", remaining };
  return json(body);
});
