// GET /api/auth/google → Google 동의 화면으로 리디렉션 (state 쿠키로 CSRF 방지). 설정이 없으면 /login?error=google_unavailable
import { googleAuthorizeUrl, googleOAuthConfig, newOAuthState, OAUTH_STATE_COOKIE, requestOrigin } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = requestOrigin(req);
  if (!googleOAuthConfig()) return Response.redirect(`${origin}/login?error=google_unavailable`, 302);
  const state = newOAuthState();
  return new Response(null, {
    status: 302,
    headers: {
      location: googleAuthorizeUrl(req, state),
      "set-cookie": `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  });
}
