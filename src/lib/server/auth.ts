/**
 * [C 소유] 쿠키(tb_uid) → 사용자. D 는 requireUser(req) 만 import 한다.
 *
 *   const user = await requireUser(req);   // { userId, nickname } 또는 401 ApiError throw
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";
import { unauthorized } from "@/lib/server/http";

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

export function getUserIdFromRequest(req: Request): string | null {
  const value = readCookie(req, SESSION_COOKIE);
  if (!value) return null;
  if (fixtureCookiesAllowed() && USER_ID.test(value)) return value;
  const secret = sessionSecret();
  if (!secret) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [version, userId, expiresAt, suppliedSignature] = parts;
  if (version !== "v1" || !USER_ID.test(userId) || !/^\d{1,12}$/.test(expiresAt) || !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)) return null;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return null;
  const expectedSignature = signature(`${version}.${userId}.${expiresAt}`, secret);
  if (!timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature))) return null;
  return userId;
}

/** 쿠키의 userId 가 실제 존재하는 사용자일 때만 통과. 아니면 401. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const userId = getUserIdFromRequest(req);
  if (!userId) throw unauthorized();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true, onboardingCompletedAt: true } });
  if (!user) throw unauthorized("세션이 만료되었습니다. 다시 로그인해 주세요.");
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
