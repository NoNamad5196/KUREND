import { ok, withMock, type Ctx } from "@/mocks/http";
import { deleteMaterial, getMaterial } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock<{ id: string }>(async (_req, { params }) => ok(getMaterial((await params).id)));
export const DELETE = withMock<{ id: string }>(async (_req, { params }: Ctx<{ id: string }>) => {
  deleteMaterial((await params).id);
  return ok({ ok: true });
});
