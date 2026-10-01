// [① 게임 코어] GET /api/runs/{id} → RunDto
import { json, withApi } from "@/lib/server/http";
import { loadOwnedRun } from "@/lib/server/run-access";
import { toRunDto } from "@/lib/server/run-dto";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { run } = await loadOwnedRun(req, params.id);
  return json(toRunDto(run));
});
