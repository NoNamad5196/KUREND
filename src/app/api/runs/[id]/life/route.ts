// [① 게임 코어] POST /api/runs/{id}/life {sessionId} → ApplyLifeResponse (세션당 1회 멱등)
import { ApplyLifeRequestSchema } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { json, parseJson, withApi } from "@/lib/server/http";
import { applyLife } from "@/lib/server/run-life";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const { sessionId } = await parseJson(req, ApplyLifeRequestSchema);
  return json(await applyLife(user.userId, params.id, sessionId));
});
