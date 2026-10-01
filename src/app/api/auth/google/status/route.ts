// GET /api/auth/google/status → { enabled } (로그인 화면이 버튼 상태를 정한다)
import { googleOAuthConfig, googleRedirectUri } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const enabled = !!googleOAuthConfig();
  return Response.json({ enabled, redirectUri: enabled ? googleRedirectUri(req) : null });
}
