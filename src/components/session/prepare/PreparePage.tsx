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
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { ApiError, sse } from "@/components/session/_api";
import { StepperHeader } from "@/components/session/StepperHeader";
import { Button, EmptyState, ProgressBar, Spinner, toast } from "@/components/session/ui";
import { useSession } from "@/components/session/useSession";
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
  const { session, setSession, loading, error, redirecting, reload, recover } = useSession(sessionId, ["PREPARING"]);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [ready, setReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const { run, game, loading: gameLoading, error: gameError, reload: reloadGame } = useSessionGame(sessionId);
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
    try {
      await sse(
        `/sessions/${sessionId}/prepare`,
        { method: "GET" },
        (name, data) => {
          if (ac.signal.aborted) return;
          if (name === "progress") setProgress(data as Progress);
          else if (name === "ready") {
            setSession((data as SseEventData<"ready">).session);
            setReady(true);
          }
        },
        ac.signal,
      );
    } catch (e) {
      if (ac.signal.aborted) return;
      if (recover(e)) return;
      if (e instanceof ApiError && e.status === 409) {
        const current = await reload();
        if (ac.signal.aborted || !current || current.status !== "PREPARING") return;
      }
      const msg = e instanceof ApiError ? e.message : "네트워크 오류가 발생했습니다.";
      setStreamError(msg);
      toast(msg, "error");
    }
  }, [sessionId, setSession, recover, reload]);

  useEffect(() => {
    setReady(false); setStreamError(null); setProgress(null); setElapsed(0); startedRef.current = false;
    return () => { abortRef.current?.abort(); startedRef.current = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!session || startedRef.current) return;
    startedRef.current = true;
    void startPrepare();
  }, [session, startPrepare]);


  if (redirecting) return null;
  if ((loading && !session) || gameLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted">
        <Spinner className="mr-2" /> 세션을 불러오는 중…
      </div>
    );
  }
  if (error || gameError || !session) {
    return <EmptyState title="세션을 불러오지 못했습니다" description={error?.message ?? gameError?.message} action={<Button onClick={() => { void reload(); void reloadGame(); }}>다시 시도</Button>} />;
  }

  const doneIdx = ready ? STEPS.length : progress ? STEPS.findIndex((s) => s.step === progress.step) : -1;
  const orbit = session.chapter.points.length ? session.chapter.points : [session.chapter.title];

  return (
    <div className="page-enter space-y-8">
      <StepperHeader session={session} step={1} chipLabel={isFinal ? "졸업시험 준비" : "세션 준비"} subtitle={`${withJosa(juniorLabel(run?.character), "은/는")} 가르친 내용만 기억합니다`} />

      <div className="prepare-layout">
        <section className="prepare-portrait kurend-rise" aria-label="이번 수업의 후배">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="editorial-label">YOUR STUDY PARTNER</p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{run ? CHARACTER_META[run.character].name : "새내기"}</h2>
            </div>
            {run && <LifeHearts lives={run.lives} maxLives={run.maxLives} size={20} />}
          </div>
          <div className="prepare-art">
            <span aria-hidden className="prepare-art-type">READY<br />TO LEARN.</span>
            {run ? <JuniorAvatar character={run.character} size={290} mood={ready ? "happy" : streamError ? "confused" : "think"} enter className={clsx("relative", ready && "kurend-pop")} /> : <JuniorOrMascot state={ready ? "cheer" : streamError ? "encourage" : "thinking"} size={250} className={clsx("relative", ready && "kurend-pop")} />}
          </div>
          {run ? (
            <div className="relative space-y-4 border-t border-primary/20 pt-5">
              {isFinal && <p className="text-sm font-semibold text-primary">졸업시험 · 자료 전체에서 출제</p>}
              <p className="text-sm leading-6">{CHARACTER_META[run.character].intro.join(" · ")}. 자료와 진도는 유지하면서 다른 후배와 새 대화를 시작할 수 있어요.</p>
              <div className="flex flex-wrap gap-x-7 gap-y-3">
                <div><p className="editorial-label">EXAM</p><p className="mt-1 text-sm font-semibold">{isFinal ? "객관식+서술형" : run.examFormat === "OBJECTIVE" ? "객관식" : "서술형"}{game?.questionCount !== undefined && ` ${game.questionCount}문항`}</p></div>
                <div><p className="editorial-label">PASS SCORE</p><p className="mt-1 text-sm font-semibold">합격 {run.passScore}점</p></div>
              </div>
              <p className="text-xs leading-5 text-muted">합격선 미만이면 LIFE −1, 100점이면 LIFE +1 (최대 {run.maxLives}).</p>
            </div>
          ) : (
            <div className="relative space-y-3 border-t border-primary/20 pt-5">
              <h3 className="text-base font-bold">연습 모드</h3>
              <p className="text-sm leading-6 text-muted">이 자료에는 아직 가르칠 후배가 없어요. LIFE·졸업 없이 자유롭게 연습합니다.</p>
              <Link href={`/materials/${session.material.materialId}/junior`} className="inline-block text-sm font-semibold text-primary hover:underline">후배 선택하고 게임으로 시작 →</Link>
            </div>
          )}
        </section>

        <section className="min-w-0 py-3 sm:py-6" aria-label="수업 준비 상태">
          <p className="editorial-label mb-6">BEFORE WE BEGIN / 01</p>
          {ready ? (
            <div className="space-y-7">
              <div className="kurend-pop">
                <p className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">새내기가 준비됐어요</p>
                <p className="mt-4 text-sm leading-6 text-muted">
                  학습 목표 {session.objectives.length}개와 시험 문항 {session.exam?.questions.length ?? 3}개를 만들었습니다.
                </p>
              </div>
              <ul className="kurend-stagger border-t border-line text-sm">
                {session.objectives.map((o, i) => (
                  <li key={o.id} className="flex gap-4 border-b border-line py-4 leading-6">
                    <span className="font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                    <span>{o.text}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" onClick={() => router.push(`/session/${sessionId}/teach`)} className="kurend-pop w-full sm:w-auto">
                이 새내기로 시작 →
              </Button>
            </div>
          ) : streamError ? (
            <div className="space-y-5" role="alert">
              <p className="text-3xl font-bold tracking-tight">준비에 실패했어요</p>
              <p className="text-sm leading-6 text-danger">{streamError}</p>
              <Button onClick={() => void startPrepare()}>다시 시도</Button>
            </div>
          ) : (
            <div className="space-y-6" aria-live="polite">
              <div>
                <p className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">자료를 바탕으로<br />수업과 시험을 준비하는 중</p>
                <p className="mt-4 text-sm leading-6 text-muted">{progress?.message ?? "자료를 펼치는 중"}</p>
              </div>
              <ProgressBar value={doneIdx + 1} max={STEPS.length + 1} />
              <ol className="border-t border-line text-sm">
                {STEPS.map((s, i) => {
                  const state = i < doneIdx ? "done" : i === doneIdx ? "active" : "todo";
                  return (
                    <li key={s.step} className={clsx("flex items-center gap-4 border-b border-line py-4 transition-colors", state === "todo" ? "text-muted" : "text-ink")}>
                      <span
                        className={clsx(
                          "grid h-6 w-6 place-items-center rounded-sm text-[11px] font-bold",
                          state === "done" && "kurend-pop bg-primary text-primary-ink",
                          state === "active" && "bg-accent text-primary",
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
              <p className="font-mono text-xs tabular-nums text-muted">{elapsed}초 경과</p>
            </div>
          )}
          {run && (
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-xs font-semibold text-primary">{CHARACTER_META[run.character].teachLabel}</p>
              <p className="mt-3 text-xl font-medium leading-relaxed tracking-tight">“{CHARACTER_META[run.character].exampleLine}”</p>
              <p className="mt-3 text-sm leading-6 text-muted">{CHARACTER_META[run.character].teachingHint}</p>
            </div>
          )}
          <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-5" aria-label="이번 챕터의 개념">
            {orbit.map((point) => <span key={point} className="text-xs leading-5 text-muted">{point}</span>)}
          </div>
        </section>
      </div>
    </div>
  );
}
