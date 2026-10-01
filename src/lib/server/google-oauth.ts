/**
 * Google OAuth 2.0 로그인(서버 사이드 code flow). 외부 라이브러리 없이 fetch 로 토큰 교환.
 * 환경변수: GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET (별칭 GOOGLE_OAUTH_CLIENT_ID/SECRET, NEXT_PUBLIC_GOOGLE_CLIENT_ID 도 허용)
 *           GOOGLE_REDIRECT_URI(선택, 기본 `${origin}/api/auth/google/callback`) · APP_URL(선택, 프록시 뒤에서 origin 고정)
 * Google Cloud Console 의 "승인된 리디렉션 URI" 에 콜백 주소를 그대로 등록해야 한다.
 */
import { createHash, randomBytes } from "node:crypto";

export const OAUTH_STATE_COOKIE = "tb_oauth_state";

export function googleOAuthConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** 프록시(Render) 뒤에서도 공개 origin 을 얻는다. */
export function requestOrigin(req: Request): string {
  const fixed = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export function googleRedirectUri(req: Request): string {
  return process.env.GOOGLE_REDIRECT_URI || `${requestOrigin(req)}/api/auth/google/callback`;
}

export function newOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function googleAuthorizeUrl(req: Request, state: string): string {
  const { clientId } = googleOAuthConfig()!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type GoogleProfile = { sub: string; email: string | null; name: string | null; picture: string | null };

export async function exchangeGoogleCode(req: Request, code: string): Promise<GoogleProfile> {
  const { clientId, clientSecret } = googleOAuthConfig()!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: googleRedirectUri(req), grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Google 토큰 교환 실패 (${res.status})`);
  const token = (await res.json()) as { id_token?: string; access_token?: string };
  // id_token 은 Google 토큰 엔드포인트에서 TLS 로 직접 받은 값이라 페이로드를 그대로 읽는다.
  if (token.id_token) {
    const payload = JSON.parse(Buffer.from(token.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload.sub === "string") {
      return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : null, name: typeof payload.name === "string" ? payload.name : null, picture: typeof payload.picture === "string" ? payload.picture : null };
    }
  }
  if (!token.access_token) throw new Error("Google 토큰에 사용자 정보가 없습니다.");
  const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!info.ok) throw new Error(`Google 사용자 정보 조회 실패 (${info.status})`);
  const profile = (await info.json()) as { sub: string; email?: string; name?: string; picture?: string };
  return { sub: profile.sub, email: profile.email ?? null, name: profile.name ?? null, picture: profile.picture ?? null };
}

/** Google sub → 안정적인 사용자 id (usr_ + 14자, ids.ts 규칙과 같은 형태). 재배포로 DB 가 초기화돼도 같은 id 가 나온다. */
export function googleUserId(sub: string): string {
  return `usr_${createHash("sha256").update(`google:${sub}`).digest("hex").slice(0, 14)}`;
}

export function googleNickname(profile: GoogleProfile): string {
  const name = profile.name?.trim();
  if (name) return name.slice(0, 40);
  const local = profile.email?.split("@")[0]?.trim();
  return local ? local.slice(0, 40) : "선배";
}
