"use client";
/**
 * §8-6 세션 준비 화면. 진입 즉시 GET /sessions/{id}/prepare SSE.
 * 준비 중에는 난이도(쉽게/어렵게) 선택 가능 — ready 전이면 로컬에 들고 있다가 ready 후 PATCH.
 */
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JuniorLevel, SessionDto } from "@/contracts/types";
import type { SseEventData } from "@/contracts/events";
import { Mascot } from "@/components/mascot/Mascot";
import { api, ApiError, sse } from "@/components/session/_api";
import { StepperHeader } from "@/components/session/StepperHeader";
import { Button, Card, Chip, EmptyState, ProgressBar, Spinner, toast } from "@/components/session/ui";
import { useSession } from "@/components/session/useSession";

const LEVELS: Array<{ value: JuniorLevel; title: string; quote: string; hint: string }> = [
  { value: "EASY", title: "쉽게", quote: "선배, 나 궁금한 거 많아. 이상하면 바로 되물을게.", hint: "자료와 어긋난 설명이면 새내기가 바로 되묻습니다." },
  { value: "HARD", title: "어렵게", quote: "말하는 대로 받아쓸게. 틀려도 안 물어. 시험에서 봐.", hint: "되묻기 없음. 틀린 설명은 시험에서 드러납니다." },
];

const STEPS = [
  { step: "OBJECTIVES", label: "학습 목표 정하기" },
  { step: "QUESTIONS", label: "시험 문제 만들기" },
  { step: "GREETING", label: "첫 질문 준비하기" },
] as const;

type Progress = SseEventData<"progress">;

export function PreparePage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { session, setSession, loading, error, redirecting, reload } = useSession(sessionId, ["PREPARING"]);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [ready, setReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState<JuniorLevel>("EASY");
  const [patching, setPatching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!session || ready || streamError) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [session, ready, streamError]);

  const startPrepare = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStreamError(null);
    setProgress(null);
    let reported = false;
    try {
      await sse(
        `/sessions/${sessionId}/prepare`,
        { method: "GET" },
        (name, data) => {
          if (name === "progress") setProgress(data as Progress);
          else if (name === "ready") {
            setSession((data as SseEventData<"ready">).session);
            setReady(true);
          } else if (name === "error") {
            reported = true;
            const msg = (data as SseEventData<"error">).message || "준비에 실패했습니다.";
            setStreamError(msg);
            toast(msg, "error");
          }
        },
        ac.signal,
      );
    } catch (e) {
      if (ac.signal.aborted || reported) return;
      const msg = e instanceof ApiError ? e.message : "네트워크 오류가 발생했습니다.";
      setStreamError(msg);
      toast(msg, "error");
    }
  }, [sessionId, setSession]);

  useEffect(() => {
    if (!session || startedRef.current) return;
    startedRef.current = true;
    setLevel(session.juniorLevel);
    void startPrepare();
  }, [session, startPrepare]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // ready 후 로컬 선택이 서버와 다르면 PATCH
  useEffect(() => {
    if (!ready || !session || session.juniorLevel === level) return;
    let cancelled = false;
    setPatching(true);
    api
      .patch<SessionDto>(`/sessions/${sessionId}`, { juniorLevel: level })
      .then((s) => !cancelled && setSession(s))
      .catch((e: unknown) => {
        if (cancelled) return;
        toast(e instanceof ApiError ? e.message : "난이도 변경에 실패했습니다.", "error");
        setLevel(session.juniorLevel);
      })
      .finally(() => !cancelled && setPatching(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, level, sessionId]);

  if (redirecting) return null;
  if (loading && !session) {
    return (
      <div className="flex items-center justify-center py-24 text-muted">
        <Spinner className="mr-2" /> 세션을 불러오는 중…
      </div>
    );
  }
  if (error || !session) {
    return <EmptyState title="세션을 불러오지 못했습니다" description={error?.message} action={<Button onClick={() => void reload()}>다시 시도</Button>} />;
  }

  const doneIdx = ready ? STEPS.length : progress ? STEPS.findIndex((s) => s.step === progress.step) : -1;
  const orbit = session.chapter.points.length ? session.chapter.points : [session.chapter.title];

  return (
    <div className="space-y-6">
      <StepperHeader session={session} step={1} chipLabel="세션 준비" subtitle="새내기는 가르친 내용만 기억합니다" />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="kurend-rise relative flex flex-col items-center gap-5 overflow-hidden px-6 py-8 text-center">
          {/* 마스코트 + 궤도 개념 칩 */}
          <div className="relative grid h-[260px] w-full max-w-[360px] place-items-center">
            <div
              aria-hidden
              className="absolute inset-6 rounded-full"
              style={{ background: "radial-gradient(circle, var(--primary-soft) 0%, transparent 70%)" }}
            />
            {!ready && (
              <div className="kurend-orbit" aria-hidden>
                {orbit.map((p, i) => {
                  const deg = (360 / orbit.length) * i;
                  return (
                    <span key={p} style={{ transform: `rotate(${deg}deg) translate(132px) rotate(${-deg}deg)` }}>
                      <span className="inline-block animate-[kurend-orbit_22s_linear_infinite_reverse] whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted shadow-card">
                        {p}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
            <div className={clsx("relative", ready && "kurend-pop")}>
              <Mascot state={ready ? "cheer" : streamError ? "encourage" : "thinking"} size={150} />
            </div>
          </div>

          {ready ? (
            <div className="w-full space-y-4">
              <div className="kurend-pop">
                <p className="text-lg font-bold">새내기가 준비됐어요</p>
                <p className="mt-1 text-sm text-muted">
                  학습 목표 {session.objectives.length}개와 시험 문항 {session.exam?.questions.length ?? 3}개를 만들었습니다.
                </p>
              </div>
              <ul className="kurend-stagger mx-auto w-full max-w-md space-y-1.5 text-left text-sm">
                {session.objectives.map((o, i) => (
                  <li key={o.id} className="flex gap-2 rounded-sm bg-bg px-3 py-2">
                    <span className="font-semibold text-primary">{i + 1}</span>
                    <span>{o.text}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" loading={patching} onClick={() => router.push(`/session/${sessionId}/teach`)} className="kurend-pop shadow-card">
                이 새내기로 시작 →
              </Button>
            </div>
          ) : streamError ? (
            <div className="space-y-3">
              <p className="text-lg font-bold">준비에 실패했어요</p>
              <p className="text-sm text-danger">{streamError}</p>
              <Button onClick={() => void startPrepare()}>다시 시도</Button>
            </div>
          ) : (
            <div className="w-full max-w-sm space-y-4" aria-live="polite">
              <div>
                <p className="text-lg font-bold">새내기가 자료를 읽고 시험 문제를 만드는 중</p>
                <p className="mt-1 text-sm text-muted">{progress?.message ?? "자료를 펼치는 중"}</p>
              </div>
              <ProgressBar value={doneIdx + 1} max={STEPS.length + 1} />
              <ol className="space-y-1.5 text-left text-sm">
                {STEPS.map((s, i) => {
                  const state = i < doneIdx ? "done" : i === doneIdx ? "active" : "todo";
                  return (
                    <li key={s.step} className={clsx("flex items-center gap-2 transition-colors", state === "todo" ? "text-muted" : "text-ink")}>
                      <span
                        className={clsx(
                          "grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold",
                          state === "done" && "kurend-pop bg-ok text-white",
                          state === "active" && "bg-primary-soft text-primary",
                          state === "todo" && "bg-line text-muted",
                        )}
                      >
                        {state === "done" ? "✓" : state === "active" ? <Spinner className="h-3 w-3" /> : i + 1}
                      </span>
                      {s.label}
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs tabular-nums text-muted">{elapsed}초 경과</p>
            </div>
          )}
        </Card>

        <Card className="kurend-rise px-5 py-5 [animation-delay:.08s]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">새내기 난이도</h2>
            <Chip tone={level === "EASY" ? "primary" : "accent"}>{level === "EASY" ? "쉽게" : "어렵게"}</Chip>
          </div>
          <p className="mt-1 text-sm text-muted">가르치기 시작하면 바꿀 수 없습니다.</p>
          <fieldset className="mt-4 space-y-3" aria-label="난이도 선택" disabled={patching}>
            {LEVELS.map((opt) => {
              const selected = opt.value === level;
              return (
                <label
                  key={opt.value}
                  className={clsx(
                    "block cursor-pointer rounded-card border px-4 py-3 transition duration-200 focus-within:ring-2 focus-within:ring-primary",
                    selected ? "scale-[1.01] border-primary bg-primary-soft shadow-card" : "border-line bg-surface hover:-translate-y-0.5 hover:bg-bg",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      id={`level-${opt.value}`}
                      type="radio"
                      name="juniorLevel"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setLevel(opt.value)}
                      className="mt-1 accent-[var(--primary)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{opt.title}</p>
                      <p className="mt-0.5 text-sm">“{opt.quote}”</p>
                      <p className="mt-1 text-xs text-muted">{opt.hint}</p>
                    </div>
                    <Mascot state={opt.value === "EASY" ? "doubt" : "writing"} size={56} className={clsx("shrink-0 transition-opacity", selected ? "opacity-100" : "opacity-40")} />
                  </div>
                </label>
              );
            })}
          </fieldset>
        </Card>
      </div>
    </div>
  );
}
