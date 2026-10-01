import { PatchSessionRequestSchema } from "@/contracts/types";
import { ok, readJson, withMock } from "@/mocks/http";
import { deleteSession, getOrCreateSession, getSession, patchLevel, toSessionDto } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type P = { id: string };
export const GET = withMock<P>(async (_req, { params }) => ok(toSessionDto(getOrCreateSession((await params).id))));
export const PATCH = withMock<P>(async (req, { params }) => {
  const s = getSession((await params).id);
  const { juniorLevel } = await readJson(req, PatchSessionRequestSchema);
  patchLevel(s, juniorLevel);
  return ok(toSessionDto(s));
});
export const DELETE = withMock<P>(async (_req, { params }) => {
  deleteSession((await params).id);
  return ok({ ok: true });
});
