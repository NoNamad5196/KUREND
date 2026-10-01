import { ok, withMock } from "@/mocks/http";
import { store } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock(() => ok(store().users));
