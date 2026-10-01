import { demoAuthEnabled, isDemoUserId } from "@/lib/server/demo-auth";
import { notFound, ok, withMock } from "@/mocks/http";
import { store } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock(() => {
  if (!demoAuthEnabled()) throw notFound();
  return ok(store().users.filter(({ userId }) => isDemoUserId(userId)).map(({ userId, nickname }) => ({ userId, nickname })));
});
