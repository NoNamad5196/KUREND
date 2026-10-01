// [① 게임 코어] POST /api/runs/{id}/life {sessionId} → ApplyLifeResponse (세션당 1회 멱등)
import { ApplyLifeRequestSchema } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { json, parseJson, withApi } from "@/lib/server/http";
import { applyLife } from "@/lib/server/run-life";
import { ensureWrongNotes } from "@/lib/server/wrong-note";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const { sessionId } = await parseJson(req, ApplyLifeRequestSchema);
  // 틀린 문항 오답노트 자동 저장 — 판정 전에 해 두어야 GAME OVER 요약의 오답노트 수에 반영된다
  await ensureWrongNotes(user.userId, sessionId);
  return json(await applyLife(user.userId, params.id, sessionId));
});
