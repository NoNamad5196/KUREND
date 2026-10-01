import { ok, withMock } from "@/mocks/http";
import { getSession, markGapReviewed } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string; gapId: string }>(async (_req, { params }) => {
  const { id, gapId } = await params;
  const remaining = markGapReviewed(getSession(id), gapId);
  return ok({ gapId, status: "REVIEWED", remaining });
});
