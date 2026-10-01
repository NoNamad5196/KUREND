/** SSE wire protocol from §6. close() always appends exactly one done event. */
export function createSse() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let done = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function stop() {
    closed = true;
    if (timer) clearInterval(timer);
  }
  function write(chunk: string) {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      stop(); // The browser can cancel while a model call is still completing.
    }
  }
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      write(": connected\n\n");
      timer = setInterval(() => write(": ping\n\n"), 15_000);
      // A heartbeat should not keep CLI tests alive after their work finishes.
      timer.unref?.();
    },
    cancel() { stop(); },
  });

  function send(event: string, data: unknown) {
    if (closed || done) return;
    if (!/^[a-z][a-z.]*$/.test(event)) throw new Error("Invalid SSE event name");
    write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (event === "done") done = true;
  }
  function close() {
    if (closed) return;
    if (!done) send("done", {});
    stop();
    try { controller.close(); } catch { /* Already cancelled. */ }
  }
  return {
    response: new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    }),
    send,
    ping() { if (!done) write(": ping\n\n"); },
    close,
  };
}
