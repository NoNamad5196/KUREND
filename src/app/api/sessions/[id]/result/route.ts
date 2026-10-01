// [C] GET /api/sessions/{id}/result → §5-5-2 (RESULT_READY 이후)
import { json, withApi } from "@/lib/server/http";
import { assertStatus, loadOwnedSession } from "@/lib/server/session-access";
import { toResultDto } from "@/lib/server/session-dto";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  assertStatus(session, ["RESULT_READY", "REVIEWING", "COMPLETED"], "결과 조회");
  return json(toResultDto(session));
});
