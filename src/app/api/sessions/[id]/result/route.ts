// [C] GET /api/sessions/{id}/result → §5-5-2 (RESULT_READY 이후)
import { json, withApi } from "@/lib/server/http";
import { assertStatus, loadOwnedSession } from "@/lib/server/session-access";
import { toResultDto } from "@/lib/server/session-dto";
import { ensureWrongNotes } from "@/lib/server/wrong-note";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { user, session } = await loadOwnedSession(req, params.id);
  assertStatus(session, ["RESULT_READY", "REVIEWING", "COMPLETED"], "결과 조회");
  // [게임 확장] 틀린 문항은 오답노트에 자동 저장 (멱등)
  await ensureWrongNotes(user.userId, session.id);
  return json(toResultDto(session));
});
