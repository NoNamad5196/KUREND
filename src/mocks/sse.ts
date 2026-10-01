/**
 * [B] mock 전용 SSE 헬퍼. D의 lib/server/sse.ts 와 같은 와이어 포맷(§6).
 * 첫 줄 ": connected", 이벤트 "event: x\ndata: {...}\n\n", 15초 ping, 마지막은 항상 "done".
 */
import { MockError } from "./http";

export type MockSse = {
  response: Response;
  send: (event: string, data: unknown) => void;
  close: () => void;
  readonly closed: boolean;
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createMockSse(req?: Request): MockSse {
  const enc = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  let ping: ReturnType<typeof setInterval> | null = null;

  const write = (chunk: string) => {
    if (closed || !controller) return;
    try {
      controller.enqueue(enc.encode(chunk));
    } catch {
      closed = true;
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    try {
      controller?.close();
    } catch {
      /* 이미 닫힘 */
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      write(": connected\n\n");
      ping = setInterval(() => write(": ping\n\n"), 15_000);
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
    },
  });
  req?.signal?.addEventListener("abort", () => {
    closed = true;
    if (ping) clearInterval(ping);
  });

  return {
    response: new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }),
    send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`),
    close,
    get closed() {
      return closed;
    },
  };
}

/**
 * SSE 응답을 즉시 돌려주고 producer 를 백그라운드로 실행. 예외는 error 이벤트로, 끝은 항상 done.
 * producer 가 던진 MockError 는 그 code 로, 그 외는 LLM_FAILED 로 전달.
 */
export function runStream(req: Request, producer: (s: MockSse) => Promise<void>): Response {
  const s = createMockSse(req);
  void (async () => {
    try {
      await producer(s);
    } catch (e) {
      const code = e instanceof MockError ? e.code : "LLM_FAILED";
      const message = e instanceof Error ? e.message : "알 수 없는 오류";
      s.send("error", { code, message });
    } finally {
      s.send("done", {});
      s.close();
    }
  })();
  return s.response;
}

/** 글자 단위 전송 */
export async function sendChars(s: MockSse, text: string, ms: number, emit: (ch: string, last: boolean) => void) {
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    if (s.closed) return;
    emit(chars[i], i === chars.length - 1);
    await sleep(ms);
  }
}
