// GET /api/auth/google/callback?code=&state= → 로그인 → 신규 가입만 온보딩, 기존 계정은 홈
import { db } from "@/lib/server/db";
import { nameCookieHeader, readCookie, sessionCookieHeader } from "@/lib/server/auth";
import { exchangeGoogleCode, googleNickname, googleOAuthConfig, googleUserId, OAUTH_STATE_COOKIE, requestOrigin } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const url = new URL(req.url);
  const fail = (reason: string) =>
    new Response(null, { status: 302, headers: { location: `${origin}/login?error=${reason}`, "set-cookie": `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });
  if (!googleOAuthConfig()) return fail("google_unavailable");
  if (url.searchParams.get("error")) return fail("google_denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== readCookie(req, OAUTH_STATE_COOKIE)) return fail("google_state");
  try {
    const profile = await exchangeGoogleCode(req, code);
    const id = googleUserId(profile.sub);
    const nickname = googleNickname(profile);
    const existingUser = await db.user.findUnique({ where: { id }, select: { id: true } });
    await db.user.upsert({ where: { id }, create: { id, nickname }, update: { nickname } });
    // 미완료 기록이 있어도 재로그인에서는 온보딩을 자동으로 다시 열지 않는다.
    const destination = existingUser ? "/" : "/onboarding?mode=signup";
    const headers = new Headers({ location: `${origin}${destination}` });
    headers.append("set-cookie", sessionCookieHeader(id));
    headers.append("set-cookie", nameCookieHeader(nickname));
    headers.append("set-cookie", `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("[google-oauth]", error instanceof Error ? error.message : error);
    return fail("google_failed");
  }
}
