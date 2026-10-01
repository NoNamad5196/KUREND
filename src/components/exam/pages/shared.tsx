"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SseEvent } from "@/contracts/events";
import type { ResultDto } from "@/contracts/types";
import { api, ApiError, sse } from "@/components/session/_api";
import { JuniorOrMascot } from "@/components/game/JuniorOrMascot";
import { Button, EmptyState, toast } from "@/components/session/ui";

export function PageLoading({ text = "학습 기록을 불러오는 중이에요" }: { text?: string }) {
  return <div className="page-enter flex min-h-[50vh] flex-col items-center justify-center gap-6" role="status"><p className="editorial-label text-muted">A MOMENT TO THINK</p><JuniorOrMascot identityPending size={144} /><p className="text-center text-sm leading-6 text-muted">{text}</p></div>;
}
export function PageError({ message, retry }: { message: string; retry: () => void }) {
  return <EmptyState title="잠시 멈췄어요" description={message} action={<Button variant="secondary" onClick={retry}>다시 시도</Button>} />;
}

/** 중복 클릭을 막고 화면을 떠날 때 진행 중인 스트림을 닫는다. */
export function useTask(reload?: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);
  const run = useCallback(async (work: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true); setError(null);
    try { await work(active.signal); }
    catch (cause) {
      if (active.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "요청을 처리하지 못했어요. 다시 시도해 주세요.";
      setError(message); toast(message, "error");
      if (cause instanceof ApiError && (cause.status === 409 || cause.code === "INVALID_STATE")) await reload?.();
    } finally {
      active.abort();
      if (controller.current === active) { controller.current = null; setBusy(false); }
    }
  }, [reload]);
  return { busy, error, run };
}

/** 정상 종료 이벤트가 없는 연결 끊김을 성공으로 취급하지 않는다. */
export async function stream(url: string, body: unknown, signal: AbortSignal, receive: (event: SseEvent) => void) {
  let done = false;
  await sse(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, (name, data) => {
    if (signal.aborted) return;
    const event = { event: name, data } as SseEvent;
    if (event.event === "error") throw new ApiError(event.data.code, event.data.message, event.data.code === "INVALID_STATE" ? 409 : 0);
    if (event.event === "done") done = true;
    receive(event);
  }, signal);
  if (!signal.aborted && !done) throw new Error("연결이 끊겼어요. 다시 시도하면 저장된 내용부터 이어집니다.");
}

/** 채점 중 새로고침 시 evaluate를 다시 호출하지 않고 저장된 결과를 기다린다. */
export function useResultData(sessionId: string, enabled: boolean, evaluating = false, reload?: () => Promise<unknown>) {
  const [result, setResult] = useState<ResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function read() {
      try {
        const value = await api.get<ResultDto>(`/sessions/${encodeURIComponent(sessionId)}/result`);
        if (!cancelled) { setResult(value); setError(null); }
      } catch (cause) {
        if (cancelled) return;
        if (evaluating && cause instanceof ApiError && cause.status === 409 && polls++ < 60) {
          timer = setTimeout(() => void read(), 1000); return;
        }
        const message = evaluating && cause instanceof ApiError && cause.status === 409 ? "채점이 아직 끝나지 않았어요. 잠시 후 다시 확인해 주세요." : cause instanceof Error ? cause.message : "결과를 불러오지 못했어요.";
        setError(message); toast(message, "error");
        if (!evaluating && cause instanceof ApiError && cause.status === 409) void reload?.();
      }
    }
    setError(null);
    void read();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId, enabled, evaluating, attempt, reload]);
  return { result, setResult, error, retry: () => setAttempt((value) => value + 1) };
}
