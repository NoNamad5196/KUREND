/**
 * [C 소유] Next.js 서버 시작 훅. Node 런타임에서 한 번만 실행되어
 * D 의 스트리밍 라우트에 C 의 DB·인증 어댑터를 등록한다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installLlmRouteBackend } = await import("@/lib/server/llm-backend");
    installLlmRouteBackend();
  }
}
