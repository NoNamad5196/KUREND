/** mock 인증: 쿠키 tb_uid. 세션/자료 라우트는 쿠키가 없으면 체험 1로 간주(화면 개발 편의), /auth/me 만 엄격. */
import { DEFAULT_USER, getUser } from "./store";
export const COOKIE = process.env.SESSION_COOKIE || "tb_uid";
export function cookieUser(req: Request): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const id = m ? decodeURIComponent(m[1]) : null;
  return id && getUser(id) ? id : null;
}
export const currentUser = (req: Request) => cookieUser(req) ?? DEFAULT_USER;
