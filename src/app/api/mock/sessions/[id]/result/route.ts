import { ok, withMock } from "@/mocks/http";
import { getSession, toResultDto } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock<{ id: string }>(async (_req, { params }) => ok(toResultDto(getSession((await params).id))));
