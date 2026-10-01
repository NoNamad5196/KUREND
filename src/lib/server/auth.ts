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
  return readSession(req)?.userId ?? null;
}

/** signed=true 는 서버 비밀키로 서명을 확인한 운영 세션(개발용 평문 쿠키는 false). */
function readSession(req: Request): { userId: string; signed: boolean } | null {
  const value = readCookie(req, SESSION_COOKIE);
  if (!value) return null;
  if (fixtureCookiesAllowed() && USER_ID.test(value)) return { userId: value, signed: false };
  const secret = sessionSecret();
  if (!secret) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [version, userId, expiresAt, suppliedSignature] = parts;
  if (version !== "v1" || !USER_ID.test(userId) || !/^\d{1,12}$/.test(expiresAt) || !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)) return null;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return null;
  const expectedSignature = signature(`${version}.${userId}.${expiresAt}`, secret);
  if (!timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature))) return null;
  return { userId, signed: true };
}

/** 표시 이름 쿠키 — 세션이 아니다(권한 없음). 계정 행을 되살릴 때 닉네임으로만 쓴다. */
export const NAME_COOKIE = "tb_name";
const NICKNAME_MAX = 40;
export function nameCookieHeader(nickname: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${NAME_COOKIE}=${encodeURIComponent(nickname.slice(0, NICKNAME_MAX))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

/** 쿠키의 userId 가 실제 존재하는 사용자일 때만 통과. 아니면 401. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const session = readSession(req);
  if (!session) throw unauthorized();
  const { userId } = session;
  let user = await db.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true, onboardingCompletedAt: true } });
  if (!user && session.signed) {
    // 무료 호스팅처럼 DB 파일이 재시작·재배포 때 초기화되는 환경에서도, 서명이 확인된 로그인은
    // 다시 로그인시키지 않고 계정 행만 되살린다(이전 학습 기록은 DB 와 함께 사라진 상태).
    const nickname = (readCookie(req, NAME_COOKIE) ?? "").trim().slice(0, NICKNAME_MAX) || "선배";
    const select = { id: true, nickname: true, onboardingCompletedAt: true } as const;
    user = await db.user.upsert({
      where: { id: userId },
      create: { id: userId, nickname, onboardingCompletedAt: new Date() },
      update: {},
      select,
    }).catch(() => db.user.findUnique({ where: { id: userId }, select })); // 동시 요청이 먼저 만든 경우
    console.warn("[auth] 서명된 세션의 계정이 DB에 없어 다시 만들었습니다(DB 초기화 의심).");
  }
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
