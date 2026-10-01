import { COOKIE } from "@/mocks/auth";
import { withMock } from "@/mocks/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock(() => {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
});
