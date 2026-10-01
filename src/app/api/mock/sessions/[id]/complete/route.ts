import { ok, withMock } from "@/mocks/http";
import { complete, getSession } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string }>(async (_req, { params }) => ok(complete(getSession((await params).id))));
