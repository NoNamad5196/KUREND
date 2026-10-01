/**
 * [C 소유] 쿠키(tb_uid) → 사용자. D 는 requireUser(req) 만 import 한다.
 *
 *   const user = await requireUser(req);   // 사용자 또는 인증 실패 401 / 계정 확인 장애 503
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";
import { ApiError, unauthorized } from "@/lib/server/http";

export const SESSION_COOKIE = process.env.SESSION_COOKIE || "tb_uid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일
const USER_ID = /^usr_[A-Za-z0-9_-]{1,64}$/;

function fixtureCookiesAllowed(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

/** Existing Google deployments can sign sessions without a new required setting. */
function sessionSecret(): string | undefined {
  return process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`kurend-session:${payload}`).digest("base64url");
}

export type AuthUser = { userId: string; nickname: string; onboardingCompletedAt: Date | null };

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

type SessionFailure = "MISSING_COOKIE" | "SIGNING_KEY_MISSING" | "INVALID_SESSION" | "EXPIRED_SESSION";
type SessionIdentity = { userId: string; signed: boolean } | { userId: null; reason: SessionFailure };

function sessionIdentity(req: Request): SessionIdentity {
  const value = readCookie(req, SESSION_COOKIE);
  if (!value) return { userId: null, reason: "MISSING_COOKIE" };
  if (fixtureCookiesAllowed() && USER_ID.test(value)) return { userId: value, signed: false };
  const secret = sessionSecret();
  if (!secret) return { userId: null, reason: "SIGNING_KEY_MISSING" };
  const parts = value.split(".");
  if (parts.length !== 4) return { userId: null, reason: "INVALID_SESSION" };
  const [version, userId, expiresAt, suppliedSignature] = parts;
  if (version !== "v1" || !USER_ID.test(userId) || !/^\d{1,12}$/.test(expiresAt) || !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)) return { userId: null, reason: "INVALID_SESSION" };
  const expectedSignature = signature(`${version}.${userId}.${expiresAt}`, secret);
  if (!timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature))) return { userId: null, reason: "INVALID_SESSION" };
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return { userId: null, reason: "EXPIRED_SESSION" };
  return { userId, signed: true };
}

export function getUserIdFromRequest(req: Request): string | null {
  return sessionIdentity(req).userId;
}

function authUnavailable(reason: "SIGNING_KEY_MISSING" | "ACCOUNT_NOT_FOUND"): ApiError {
  // Deliberately omit cookies, keys, user IDs and provider/DB exception messages.
  console.error("[auth] unavailable", { reason });
  return new ApiError("AUTH_UNAVAILABLE", "로그인 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
}

/** Invalid/expired identity is 401; a valid signed identity with missing account data is a service failure. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const identity = sessionIdentity(req);
  if (identity.userId === null) {
    if (identity.reason === "SIGNING_KEY_MISSING") throw authUnavailable(identity.reason);
    if (identity.reason !== "MISSING_COOKIE") console.warn("[auth] rejected", { reason: identity.reason });
    throw unauthorized(identity.reason === "EXPIRED_SESSION" ? "로그인이 만료되었습니다. 다시 로그인해 주세요." : "로그인이 필요합니다.");
  }
  const user = await db.user.findUnique({ where: { id: identity.userId }, select: { id: true, nickname: true, onboardingCompletedAt: true } });
  if (!user) {
    if (identity.signed) throw authUnavailable("ACCOUNT_NOT_FOUND");
    throw unauthorized("로그인 계정을 확인할 수 없습니다. 다시 로그인해 주세요.");
  }
  return { userId: user.id, nickname: user.nickname, onboardingCompletedAt: user.onboardingCompletedAt };
}

export function sessionCookieHeader(userId: string): string {
  if (!USER_ID.test(userId)) throw new Error("올바르지 않은 세션 사용자입니다.");
  let value = userId;
  if (!fixtureCookiesAllowed()) {
    const secret = sessionSecret();
    if (!secret) throw new Error("세션 서명 키가 설정되지 않았습니다.");
    const payload = `v1.${userId}.${Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE}`;
    value = `${payload}.${signature(payload, secret)}`;
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
