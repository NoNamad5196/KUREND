import { ok, withMock } from "@/mocks/http";
import { excludeMessage, getSession } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string; mid: string }>(async (_req, { params }) => {
  const { id, mid } = await params;
  excludeMessage(getSession(id), mid);
  return ok({ ok: true });
});
