// [① 게임 코어] GET /api/runs/{id} → RunDto
import { json, parseJson, withApi } from "@/lib/server/http";
import { ChangeCharacterRequestSchema } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { changeCharacter } from "@/lib/server/change-character";
import { loadOwnedRun } from "@/lib/server/run-access";
import { toRunDto } from "@/lib/server/run-dto";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { run } = await loadOwnedRun(req, params.id);
  return json(toRunDto(run));
});

export const PATCH = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const body = await parseJson(req, ChangeCharacterRequestSchema);
  return json(await changeCharacter(user.userId, params.id, body));
});
