"use client";
/**
 * §8-6 세션 준비 화면. 진입 즉시 GET /sessions/{id}/prepare SSE.
 * 난이도는 후배 선택(Run)으로 정해진다 — 여기서는 현재 후배 카드만 보여주고 토글은 없다.
 */
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SseEventData } from "@/contracts/events";
import { ApiError, sse } from "@/components/session/_api";
import { StepperHeader } from "@/components/session/StepperHeader";
import { Button, Card, EmptyState, ProgressBar, Spinner, toast } from "@/components/session/ui";
import { useSession } from "@/components/session/useSession";
import { CharacterBadge } from "@/components/game/CharacterBadge";
import { CHARACTER_META } from "@/components/game/characters";
import { LifeHearts } from "@/components/game/LifeHearts";
import { useSessionGame } from "@/components/game/useSessionGame";
import { JuniorOrMascot, juniorLabel, withJosa } from "@/components/game/JuniorOrMascot";

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
  const { run, game } = useSessionGame(sessionId);
  const isFinal = game?.kind === "FINAL";
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
    void startPrepare();
  }, [session, startPrepare]);
  useEffect(() => () => abortRef.current?.abort(), []);


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
      <StepperHeader session={session} step={1} chipLabel="세션 준비" subtitle={`${withJosa(juniorLabel(run?.character), "은/는")} 가르친 내용만 기억합니다`} />

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
              <JuniorOrMascot character={run?.character} state={ready ? "cheer" : streamError ? "encourage" : "thinking"} size={150} />
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
              <Button size="lg" onClick={() => router.push(`/session/${sessionId}/teach`)} className="kurend-pop shadow-card">
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

        {run ? (
          <Card className="kurend-rise px-5 py-5 [animation-delay:.08s]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">{isFinal ? "졸업시험 — 자료 전체에서 출제" : "이번 수업의 후배"}</h2>
              <LifeHearts lives={run.lives} maxLives={run.maxLives} size={20} />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <CharacterBadge character={run.character} />
              <p className="text-sm text-muted">합격 {run.passScore}점 · {isFinal ? "졸업시험 · 객관식+서술형" : run.examFormat === "OBJECTIVE" ? "객관식" : "서술형"} {game?.questionCount ?? ""}문항</p>
            </div>
            <p className="mt-3 text-sm leading-6">{CHARACTER_META[run.character].intro.join(" · ")}. 후배는 졸업하거나 떠날 때까지 바뀌지 않습니다.</p>
            <p className="mt-2 text-xs text-muted">합격선 미만이면 LIFE −1, 100점이면 LIFE +1 (최대 {run.maxLives}).</p>
          </Card>
        ) : (
          <Card className="kurend-rise px-5 py-5 [animation-delay:.08s]">
            <h2 className="text-base font-bold">연습 모드</h2>
            <p className="mt-1 text-sm text-muted">이 자료에는 아직 가르칠 후배가 없어요. LIFE·졸업 없이 자유롭게 연습합니다.</p>
            <Link href={`/materials/${session.material.materialId}/junior`} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">후배 선택하고 게임으로 시작 →</Link>
          </Card>
        )}
      </div>
    </div>
  );
}
