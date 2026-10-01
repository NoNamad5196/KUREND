// [① 게임 코어] POST /api/runs/{id}/graduate → GraduationSummaryDto (모든 챕터 cleared 아니면 409 NOT_READY, 재호출은 같은 요약)
import { requireUser } from "@/lib/server/auth";
import { json, withApi } from "@/lib/server/http";
import { graduate } from "@/lib/server/run-life";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  return json(await graduate(user.userId, params.id));
});
