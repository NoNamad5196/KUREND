// [C] GET /api/sessions/{id} → §5-5-1 / PATCH {juniorLevel} (EXPLAINING 중에만) / DELETE → {ok:true}
import type { OkResponse } from "@/contracts/types";
import { PatchSessionRequestSchema } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { invalidState, json, parseJson, withApi } from "@/lib/server/http";
import { assertStatus, loadOwnedSession } from "@/lib/server/session-access";
import { sessionInclude, toSessionDto } from "@/lib/server/session-dto";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  return json(toSessionDto(session));
});

export const PATCH = withApi<{ id: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  const body = await parseJson(req, PatchSessionRequestSchema);
  assertStatus(session, ["EXPLAINING"], "난이도 변경");
  if (session.runId) throw invalidState("후배와 함께하는 세션은 난이도가 후배에 맞춰 고정됩니다.");
  const updated = await db.session.update({
    where: { id: session.id },
    data: { juniorLevel: body.juniorLevel },
    include: sessionInclude,
  });
  return json(toSessionDto(updated));
});

export const DELETE = withApi<{ id: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  await db.session.delete({ where: { id: session.id } });
  const body: OkResponse = { ok: true };
  return json(body);
});
