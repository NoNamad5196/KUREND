import { currentUser } from "@/mocks/auth";
import { ok, withMock } from "@/mocks/http";
import { homeDto } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock((req) => ok(homeDto(currentUser(req))));
