import { ok, withMock } from "@/mocks/http";
import { finishExplanation, getSession } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string }>(async (_req, { params }) => {
  finishExplanation(getSession((await params).id));
  return ok({ status: "EXPLAINING", phase: "EXAM_READY" });
});
