import { ok, withMock } from "@/mocks/http";
import { getSourceContent } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock<{ id: string }>(async (_req, { params }) => ok(getSourceContent((await params).id)));
