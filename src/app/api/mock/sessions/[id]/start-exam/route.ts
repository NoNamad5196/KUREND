import { ok, withMock } from "@/mocks/http";
import { getSession, startExam } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string }>(async (_req, { params }) => ok(startExam(getSession((await params).id))));
