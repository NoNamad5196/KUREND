import { cookieUser } from "@/mocks/auth";
import { jsonError, ok, withMock } from "@/mocks/http";
import { getUser, streakDays } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock((req) => {
  const id = cookieUser(req);
  if (!id) return jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  return ok({ userId: id, nickname: getUser(id)!.nickname, streakDays: streakDays(id) });
});
