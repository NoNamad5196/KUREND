// [C] POST /api/auth/logout → {ok:true} + 쿠키 삭제
import type { OkResponse } from "@/contracts/types";
import { clearSessionCookieHeader } from "@/lib/server/auth";
import { json, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = withApi(async () => {
  const body: OkResponse = { ok: true };
  return json(body, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
});
