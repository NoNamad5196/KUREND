import { withMock } from "@/mocks/http";
import { runStream, sleep } from "@/mocks/sse";
import { finishPrepare, getOrCreateSession, toSessionDto } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock<{ id: string }>(async (req, { params }) => {
  const s = getOrCreateSession((await params).id);
  const t0 = Date.now();
  return runStream(req, async (sse) => {
    if (s.status !== "PREPARING") {
      sse.send("ready", { session: toSessionDto(s) });
      return;
    }
    for (const [step, message] of [
      ["OBJECTIVES", "학습 목표를 정하는 중"],
      ["QUESTIONS", "시험 문제를 만드는 중"],
      ["GREETING", "첫 질문을 준비하는 중"],
    ] as const) {
      sse.send("progress", { step, message, elapsedMs: Date.now() - t0 });
      await sleep(700);
      if (sse.closed) return;
    }
    if (s.status === "PREPARING") finishPrepare(s); // 동시 요청 대비
    sse.send("ready", { session: toSessionDto(s) });
  });
});
