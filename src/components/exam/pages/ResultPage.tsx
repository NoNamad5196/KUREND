"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompleteResponse, GapDto, GradeDto, SessionDto } from "@/contracts/types";
import { api } from "@/components/session/_api";
import { useSession } from "@/components/session/useSession";
import { SpeechBubble } from "@/components/session/SpeechBubble";
import { StepperHeader } from "@/components/session/StepperHeader";
import { Button, Chip, ProgressBar } from "@/components/session/ui";
import { AnswerSheet } from "../AnswerSheet";
import { ReportCard } from "../ReportCard";
import { GradeBox, GradeVerdictChip } from "../verdict";
import { PageError, PageLoading, stream, useResultData, useTask } from "./shared";
import type { ApplyLifeResponse, RunDto, WrongNoteDto } from "@/contracts/game";
import Link from "next/link";
import { gameApi } from "@/lib/client/game-api";
import { ResultOverlay } from "@/components/game/ResultOverlay";
import { RunHeaderBadge } from "@/components/game/RunHeaderBadge";
import { useSessionGame } from "@/components/game/useSessionGame";
import { JuniorOrMascot, juniorLabel } from "@/components/game/JuniorOrMascot";

export function ResultPage({ sessionId }: { sessionId: string }) {
  const state = useSession(sessionId, (session) => ["EVALUATING", "RESULT_READY", "REVIEWING"].includes(session.status) || (session.status === "EXAM_IN_PROGRESS" && !!session.exam?.questions.length && session.exam.questions.every((question) => session.exam?.answers.some((answer) => answer.qid === question.qid))));
  if (state.error) return <PageError message={state.error.message} retry={() => void state.reload()} />;
  if (!state.session || state.loading || state.redirecting) return <PageLoading />;
  return <ResultContent key={sessionId} session={state.session} reload={state.reload} />;
}

function ResultContent({ session, reload }: { session: SessionDto; reload: () => Promise<unknown> }) {
  const router = useRouter();
  const { busy, error, run } = useTask(reload);
  const [evaluated, setEvaluated] = useState(false);
  const data = useResultData(session.sessionId, session.status !== "EXAM_IN_PROGRESS" || evaluated, session.status === "EVALUATING" || evaluated, reload);
  const [grades, setGrades] = useState<Record<string, GradeDto>>({});
  const [grading, setGrading] = useState<string | null>(null);
  const [gaps, setGaps] = useState<GapDto[]>([]);
  const { run: juniorRun, game, identityPending, reload: reloadGame } = useSessionGame(session.sessionId);
  const juniorRunRef = useRef<RunDto | null>(null);
  juniorRunRef.current = juniorRun;
  const [overlay, setOverlay] = useState<{ result: ApplyLifeResponse; run: RunDto } | null>(null);
  const initiated = useRef(false);
  // 오답노트: 결과 조회 시 서버가 틀린 문항을 자동 저장한다 → 이 세션의 노트를 불러와 문항별 링크로 붙인다
  const [wrongNotes, setWrongNotes] = useState<WrongNoteDto[]>([]);
  const hasResult = !!data.result;
  useEffect(() => {
    if (!hasResult) return;
    let alive = true;
    gameApi.listWrongNotes(session.material.materialId).then((ns) => { if (alive) setWrongNotes(ns.filter((n) => n.sessionId === session.sessionId)); }).catch(() => {});
    return () => { alive = false; };
  }, [hasResult, session.material.materialId, session.sessionId]);
  const answerSheet = useRef<HTMLDivElement>(null);
  const result = data.result;
  const questions = [...(session.exam?.questions ?? [])].sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (session.status !== "EXAM_IN_PROGRESS" || initiated.current) return;
    const timer = setTimeout(() => {
      initiated.current = true;
      void run(async (signal) => {
        let receivedResult = false;
        await stream(`/sessions/${encodeURIComponent(session.sessionId)}/evaluate`, undefined, signal, (event) => {
          switch (event.event) {
            case "grading": setGrading(event.data.qid); break;
            case "grade": setGrades((value) => ({ ...value, [event.data.qid]: event.data })); setGrading(null); break;
            case "gap": setGaps((value) => [...value.filter((gap) => gap.gapId !== event.data.gapId), event.data]); break;
            case "result": receivedResult = true; break;
          }
        });
        if (signal.aborted) return;
        if (!receivedResult) throw new Error("채점 결과를 확인하지 못했어요. 다시 확인해 주세요.");
        setEvaluated(true);
        // 게임: 결과가 저장된 뒤 LIFE 판정(서버가 session.score 로 계산). Run 이 없으면 연습 모드.
        const retry = <T,>(work: () => Promise<T>) => work().catch(() => new Promise((r) => setTimeout(r, 1200)).then(work));
        const game = await retry(() => gameApi.getSessionGame(session.sessionId)).catch(() => null);
        const runForLife = game?.run ?? juniorRunRef.current;
        if (runForLife && !signal.aborted) {
          const applied = await retry(() => gameApi.applyLife(runForLife.runId, session.sessionId)).catch(() => null);
          if (applied?.applied && !signal.aborted) setOverlay({ result: applied, run: runForLife });
          void reloadGame();
        }
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [session.status, session.sessionId, run, reloadGame]);

  function complete() {
    void run(async (signal) => {
      await api.post<CompleteResponse>(`/sessions/${encodeURIComponent(session.sessionId)}/complete`);
      if (!signal.aborted) router.push(`/session/${encodeURIComponent(session.sessionId)}/complete`);
    });
  }

  return <div className="page-enter min-w-0 space-y-10 sm:space-y-14">
    {overlay && <ResultOverlay result={overlay.result} character={overlay.run.character} onClose={() => setOverlay(null)} onGameOver={() => router.push(`/runs/${encodeURIComponent(overlay.run.runId)}/game-over?c=${overlay.run.character}&m=${encodeURIComponent(overlay.run.materialId)}`)} final={game?.kind === "FINAL"} onGraduate={() => router.push(`/runs/${encodeURIComponent(overlay.run.runId)}/graduation`)} />}
    <StepperHeader session={session} step={3} chipLabel={result ? "시험 결과" : "채점 중"} subtitle={`${juniorLabel(juniorRun?.character)}의 답안에서 내 설명을 돌아보세요`} right={<RunHeaderBadge run={juniorRun} />} />
    {result ? <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-14">
      <ReportCard studentName={juniorLabel(juniorRun?.character)} courseName={session.material.courseName} {...result} gapCount={result.gaps.length} />
      <div className="min-w-0 space-y-6 lg:pt-2">
        <p className="editorial-label text-muted">WHAT WE LEARNED</p>
        <div className="flex justify-center"><JuniorOrMascot character={juniorRun?.character} identityPending={identityPending} state={result.finalVerdict === "STABLE" ? "cheer" : result.finalVerdict === "MOSTLY" ? "praise" : "encourage"} size={168} /></div>
        <SpeechBubble speaker={juniorLabel(juniorRun?.character)} tail="top">배운 건 다 썼어. 못 쓴 데는 아직 못 들은 부분이야.</SpeechBubble>
        {wrongNotes.length > 0 && <div className="border-y border-line py-5"><p className="text-sm font-semibold">틀린 문항 {wrongNotes.length}개가 오답노트에 저장됐어요</p><p className="mt-2 text-xs leading-6 text-muted">왜 틀렸는지 먼저 써 보면 AI 분석이 열려요.</p><Link href={`/wrong-notes/${encodeURIComponent(wrongNotes[0].wrongNoteId)}`} className="mt-3 inline-block text-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition hover:decoration-primary">오답노트 쓰러 가기 →</Link></div>}
        <div className="flex flex-col gap-3">
          {result.gaps.length > 0 && <Button size="lg" onClick={() => router.push(`/session/${encodeURIComponent(session.sessionId)}/review`)}>왜 틀렸는지 보기 →</Button>}
          <Button size="lg" variant={result.gaps.length ? "secondary" : "primary"} loading={busy} onClick={complete}>{result.gaps.some((gap) => gap.status !== "REVIEWED") ? "놓친 곳 남기고 끝내기" : "학습 마치기 →"}</Button>
          <Button variant="ghost" className="min-h-11" onClick={() => answerSheet.current?.scrollIntoView({ block: "start" })}>문항별 채점 다시 보기 ↓</Button>
        </div>
      </div>
    </div> : <div aria-live="polite" className="space-y-5">
      <p className="editorial-label text-muted">READING THE ANSWERS</p>
      <h2 className="text-2xl font-semibold tracking-tight tabular-nums">채점 진행 중 {Object.keys(grades).length} / {questions.length}</h2>
      <ProgressBar value={Object.keys(grades).length} max={questions.length} />
      {session.status === "EVALUATING" && !data.error && <PageLoading text="채점이 진행 중이에요. 저장된 결과를 기다리고 있습니다." />}
    </div>}
    {(error || data.error) && <PageError message={error || data.error!} retry={() => { void reload(); if (data.error) data.retry(); }} />}
    <div ref={answerSheet} className="grid min-w-0 scroll-mt-28 items-start gap-8 border-t border-line pt-8 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10">
      <div className="lg:sticky lg:top-28"><p className="editorial-label mb-3 text-muted">QUESTION REVIEW</p><h2 className="text-xl font-semibold tracking-tight">문항별 채점</h2><ol className="mt-5 divide-y divide-line border-y border-line">
        {questions.map((question) => {
          const grade = result?.items.find((item) => item.qid === question.qid)?.grade ?? grades[question.qid];
          return <li key={question.qid} className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm"><span>문제 {question.order}</span>{grade ? <span className="font-semibold tabular-nums">{grade.score} / {grade.maxScore}</span> : <Chip tone={grading === question.qid ? "primary" : "muted"}>{grading === question.qid ? "채점 중" : "대기"}</Chip>}</li>;
        })}
      </ol></div>
      <AnswerSheet studentName={juniorLabel(juniorRun?.character)} courseName={session.material.courseName} instant items={questions.map((question) => {
        const item = result?.items.find((value) => value.qid === question.qid);
        const grade = item?.grade ?? grades[question.qid];
        return { ...question, text: item?.answer ?? session.exam?.answers.find((answer) => answer.qid === question.qid)?.answer ?? "", status: "done", unlearned: item?.sentences.some((sentence) => sentence.unlearned), badge: grade ? <GradeVerdictChip verdict={grade.verdict} /> : <Chip tone="muted">채점 전</Chip>, extra: <><GradeBox grade={grade ?? null} state={grade ? "done" : grading === question.qid ? "grading" : "pending"} />{(() => { const note = wrongNotes.find((n) => n.qid === question.qid); return note ? <Link href={`/wrong-notes/${encodeURIComponent(note.wrongNoteId)}`} className="mt-2 inline-flex items-center gap-1 font-sans text-sm font-bold text-primary hover:underline">✎ 오답노트{note.userReason ? " 보기" : "에 이유 쓰기"} →</Link> : null; })()}</> };
      })} />
    </div>
    {(result?.gaps ?? gaps).length > 0 && <section className="border-t border-line pt-7"><p className="editorial-label mb-3 text-muted">NEXT TO UNDERSTAND</p><h2 className="text-2xl font-semibold tracking-tight">놓친 곳 · {(result?.gaps ?? gaps).length}군데</h2><ol className="mt-6 divide-y divide-line">{(result?.gaps ?? gaps).map((gap, index) => <li key={gap.gapId} className="flex flex-wrap items-center gap-4 py-5 text-sm"><span className="text-xl font-medium tracking-tight text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 break-words">{gap.title}</span><Chip tone={gap.status === "REVIEWED" ? "ok" : "warn"}>{gap.status === "REVIEWED" ? "되짚기 완료" : "확인 필요"}</Chip></li>)}</ol></section>}
  </div>;
}
