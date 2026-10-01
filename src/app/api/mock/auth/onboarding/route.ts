import { cookieUser } from "@/mocks/auth";
import { jsonError, ok, withMock } from "@/mocks/http";
import { getUser } from "@/mocks/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withMock((req) => {
  const id = cookieUser(req);
  if (!id) return jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const user = getUser(id)!;
  user.onboardingCompletedAt ??= new Date().toISOString();
  return ok({ ok: true });
});
