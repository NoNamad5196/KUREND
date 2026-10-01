/**
 * [C 소유] 쿠키(tb_uid) → 사용자. D 는 requireUser(req) 만 import 한다.
 *
 *   const user = await requireUser(req);   // { userId, nickname } 또는 401 ApiError throw
 */
import { db } from "@/lib/server/db";
import { unauthorized } from "@/lib/server/http";

export const SESSION_COOKIE = process.env.SESSION_COOKIE || "tb_uid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일

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
  const v = readCookie(req, SESSION_COOKIE);
  return v && /^usr_[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
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
  return `${SESSION_COOKIE}=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
