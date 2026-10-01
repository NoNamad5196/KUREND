// [C] (P1) POST /api/sessions/{id}/messages/{mid}/exclude → {ok:true}
//     EXPLAINING 중 내 USER 메시지를 "이 설명 빼기". 새내기의 시험 답안 근거(taught)에서 제외된다.
import type { OkResponse } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { invalidState, json, notFound, withApi } from "@/lib/server/http";
import { assertStatus, loadOwnedSession } from "@/lib/server/session-access";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string; mid: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  assertStatus(session, ["EXPLAINING"], "설명 빼기");
  const message = session.messages.find((m) => m.id === params.mid);
  if (!message) throw notFound("메시지를 찾을 수 없습니다.");
  if (message.role !== "USER") throw invalidState("내 설명(USER 메시지)만 뺄 수 있습니다.");
  if (!message.excluded) await db.message.update({ where: { id: message.id }, data: { excluded: true } });
  const body: OkResponse = { ok: true };
  return json(body);
});
