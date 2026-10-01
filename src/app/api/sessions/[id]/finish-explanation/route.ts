// [C] POST /api/sessions/{id}/finish-explanation → {status:"EXPLAINING", phase:"EXAM_READY"}
//     USER 메시지(excluded 제외) 1개 이상 필요, 아니면 409 NO_EXPLANATION
import type { FinishExplanationResponse } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { ApiError, json, withApi } from "@/lib/server/http";
import { assertStatus, loadOwnedSession } from "@/lib/server/session-access";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  assertStatus(session, ["EXPLAINING"], "설명 마치기");
  const explained = session.messages.some((m) => m.role === "USER" && !m.excluded);
  if (!explained) throw new ApiError("NO_EXPLANATION", "새내기에게 설명을 한 번 이상 해야 시험을 볼 수 있습니다.");
  if (session.phase !== "EXAM_READY") {
    await db.session.update({ where: { id: session.id }, data: { phase: "EXAM_READY" } });
  }
  const body: FinishExplanationResponse = { status: "EXPLAINING", phase: "EXAM_READY" };
  return json(body);
});
