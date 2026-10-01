/**
 * [C 소유] D 의 스트리밍 라우트(src/lib/llm/routes)를 C 의 DB·인증에 연결한다.
 * D 는 RouteBackend 가 등록되지 않으면 모든 라우트를 502 로 막으므로, src/instrumentation.ts 가
 * 서버 프로세스 시작 시 installLlmRouteBackend() 를 한 번 호출한다. (routes/INTEGRATION.md 참고)
 *
 *  - db: C 의 Prisma 싱글턴
 *  - requireUser: C 의 쿠키 인증. 실패는 401 Response 로 던져야 D 가 502 로 감싸지 않는다.
 *  - toSessionDto: C 의 GET /sessions/{id} 와 D 의 ready 이벤트가 같은 세션 객체를 내려주도록 C 변환기를 넘긴다.
 */
import { installRouteBackend } from "@/lib/llm/routes/backend";
import { createPrismaBackend } from "@/lib/llm/routes/prisma-backend";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ApiError } from "@/lib/server/http";
import { toSessionDto, type SessionWithRelations } from "@/lib/server/session-dto";

export function installLlmRouteBackend(): void {
  installRouteBackend(
    createPrismaBackend<SessionWithRelations>({
      db,
      async requireUser(req) {
        try {
          const user = await requireUser(req);
          return { userId: user.userId };
        } catch (err) {
          // 이 어댑터는 instrumentation 번들에서 만들어져 D 라우트와 모듈 인스턴스가 다르다.
          // 그래서 D 가 instanceof RouteError 로 알아보지 못하므로, 전역 Response 로 401 을 그대로 넘긴다.
          if (err instanceof ApiError && err.code === "UNAUTHORIZED") {
            throw Response.json(
              { error: { code: "UNAUTHORIZED", message: err.message } },
              { status: 401, headers: { "Cache-Control": "no-store" } },
            );
          }
          throw err;
        }
      },
      toSessionDto,
    }),
  );
}
