import { z } from "zod";
import { demoAuthEnabled, isDemoUserId } from "@/lib/server/demo-auth";
import { COOKIE } from "@/mocks/auth";
import { MockError, readJson, withMock } from "@/mocks/http";
import { getUser } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock(async (req) => {
  if (!demoAuthEnabled()) throw new MockError(404, "NOT_FOUND", "찾을 수 없습니다.");
  const { userId } = await readJson(req, z.object({ userId: z.string() }));
  if (!isDemoUserId(userId) || !getUser(userId)) throw new MockError(404, "NOT_FOUND", "체험 계정을 찾을 수 없습니다.");
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${COOKIE}=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return res;
});
