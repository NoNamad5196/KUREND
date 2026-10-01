// [C] POST /api/auth/demo-login {userId} → {ok:true} + Set-Cookie tb_uid
import { z } from "zod";
import type { OkResponse } from "@/contracts/types";
import { nameCookieHeader, sessionCookieHeader } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { isDemoUserId } from "@/lib/server/demo-auth";
import { json, notFound, parseJson, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ userId: z.string().min(1).max(64) });

export const POST = withApi(async (req) => {
  const { userId } = await parseJson(req, BodySchema);
  // 운영에서는 공개 체험 계정 하나만 허용(isDemoUserId). 그 외 ID 는 존재 여부와 상관없이 404.
  if (!isDemoUserId(userId)) throw notFound("존재하지 않는 데모 계정입니다.");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true } });
  if (!user) throw notFound("존재하지 않는 데모 계정입니다.");
  const body: OkResponse = { ok: true };
  // 쿠키 두 개(세션·표시 이름)는 응답에 직접 append 한다 — json() 의 headers 는 객체 스프레드라 Headers 인스턴스를 비운다.
  const response = json(body);
  response.headers.append("Set-Cookie", sessionCookieHeader(user.id));
  response.headers.append("Set-Cookie", nameCookieHeader(user.nickname));
  return response;
});
