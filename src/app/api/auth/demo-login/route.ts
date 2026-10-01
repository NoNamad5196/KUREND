// [C] POST /api/auth/demo-login {userId} → {ok:true} + Set-Cookie tb_uid
import { z } from "zod";
import type { OkResponse } from "@/contracts/types";
import { sessionCookieHeader } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { demoAuthEnabled, isDemoUserId } from "@/lib/server/demo-auth";
import { json, notFound, parseJson, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ userId: z.string().min(1).max(64) });

export const POST = withApi(async (req) => {
  if (!demoAuthEnabled()) throw notFound();
  const { userId } = await parseJson(req, BodySchema);
  if (!isDemoUserId(userId)) throw notFound("존재하지 않는 데모 계정입니다.");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw notFound("존재하지 않는 데모 계정입니다.");
  const body: OkResponse = { ok: true };
  return json(body, { headers: { "Set-Cookie": sessionCookieHeader(user.id) } });
});
