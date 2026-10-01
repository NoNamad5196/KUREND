/**
 * 개발 전용 API 를 운영 배포에서 닫는다.
 * - /api/mock/**    : B 의 화면 단독 개발용 목업(메모리 저장·데모 인증)
 * - /api/a-preview/** : A 의 화면 미리보기용 픽스처
 * 운영(NODE_ENV=production)에서는 404. 필요하면 ENABLE_DEV_APIS=1 로 다시 연다.
 */
import { NextResponse } from "next/server";

export function middleware() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_APIS !== "1") {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "찾을 수 없습니다." } }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/mock/:path*", "/api/a-preview/:path*"] };
