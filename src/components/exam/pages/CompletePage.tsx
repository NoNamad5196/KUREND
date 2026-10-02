"use client";

import { useRouter } from "next/navigation";
import type { CreateSessionResponse, ResultDto, SessionDto } from "@/contracts/types";
import { api } from "@/components/session/_api";
import { useSession } from "@/components/session/useSession";
import { StepperHeader } from "@/components/session/StepperHeader";
import { Button, Card, Chip } from "@/components/session/ui";
import { ReportCard } from "../ReportCard";
import { PageError, PageLoading, useResultData, useTask } from "./shared";
import { RunHeaderBadge } from "@/components/game/RunHeaderBadge";
import { useSessionGame } from "@/components/game/useSessionGame";
import { JuniorOrMascot, juniorLabel, withJosa } from "@/components/game/JuniorOrMascot";
import { FinalExamAction, finalStageText, inFinalStage } from "@/components/game/FinalExamAction";

export function CompletePage({ sessionId }: { sessionId: string }) {
  const state = useSession(sessionId, ["COMPLETED"]);
  const data = useResultData(sessionId, !!state.session && !state.redirecting, false, state.reload);
  if (state.error || data.error) return <PageError message={state.error?.message ?? data.error!} retry={() => { void state.reload(); data.retry(); }} />;
  if (!state.session || !data.result || state.loading || state.redirecting) return <PageLoading />;
  return <CompleteContent key={sessionId} session={state.session} result={data.result} reload={state.reload} />;
}

function CompleteContent({ session, result, reload }: { session: SessionDto; result: ResultDto; reload: () => Promise<unknown> }) {
  const router = useRouter();
  const { busy, error, run } = useTask(reload);
  const { run: juniorRun, game, identityPending } = useSessionGame(session.sessionId);
  const isFinal = game?.kind === "FINAL";
  const remaining = result.gaps.filter((gap) => gap.status !== "REVIEWED").length;
  const firstTaught = !!result.chapter.taughtAt && Date.parse(result.chapter.taughtAt) >= Date.parse(session.createdAt) && Date.parse(result.chapter.taughtAt) <= Date.parse(session.updatedAt);
  const nextChapter = juniorRun && juniorRun.status === "ACTIVE" && !inFinalStage(juniorRun) && juniorRun.next && juniorRun.next.chapterId !== session.chapter.chapterId ? juniorRun.next : null;
  function teachNext() {
    if (!nextChapter || !juniorRun) return;
    void run(async (signal) => {
      const next = await api.post<CreateSessionResponse>("/sessions", { chapterId: nextChapter.chapterId, runId: juniorRun.runId });
      if (!signal.aborted) router.push(`/session/${encodeURIComponent(next.sessionId)}/prepare`);
    });
  }
  function retryChapter() {
    void run(async (signal) => {
      const next = await api.post<CreateSessionResponse>("/sessions", { chapterId: session.chapter.chapterId, juniorLevel: session.juniorLevel });
      if (!signal.aborted) router.push(`/session/${encodeURIComponent(next.sessionId)}/prepare`);
    });
  }
  return <div className="page-enter min-w-0 space-y-10 sm:space-y-14">
    <StepperHeader session={session} step={4} chipLabel="완료" subtitle="오늘 가르친 내용을 학습 기록에 남겼어요" right={<RunHeaderBadge run={juniorRun} />} />
    <div className="mx-auto max-w-5xl space-y-8 sm:space-y-10">
      <header className="grid items-center gap-6 border-b border-line pb-8 sm:grid-cols-[minmax(0,1fr)_220px] sm:pb-10"><div><h2 className="text-4xl leading-tight font-semibold tracking-[-0.03em] sm:text-5xl">학습 완료</h2><p className="mt-5 text-balance break-words text-lg leading-relaxed text-muted">{session.chapter.title}</p></div><div className="flex justify-center"><JuniorOrMascot character={juniorRun?.character} identityPending={identityPending} state={result.finalVerdict === "STABLE" ? "cheer" : result.finalVerdict === "MOSTLY" ? "praise" : "encourage"} size={204} /></div></header>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12">
      <div className="min-w-0">
      <ReportCard studentName={juniorLabel(juniorRun?.character)} courseName={session.material.courseName} {...result} gapCount={result.gaps.length} />
      <p className="mt-4 text-pretty text-xs leading-6 text-muted">이 판정은 이번에 선배가 가르친 내용으로 새내기가 받은 결과입니다. 선배의 이해도 자체를 뜻하지 않습니다.</p>
      </div>
      <section className="min-w-0 lg:pt-2"><h3 className="text-2xl font-semibold tracking-tight">이번 목차의 학습 기록</h3><div className="mt-6 flex flex-wrap items-center gap-3 border-y border-line py-5">
        <Chip tone={result.chapter.taughtAt ? "primary" : "muted"} className={firstTaught ? "motion-safe:animate-[pulse_600ms_ease-out_1]" : undefined}>{result.chapter.taughtAt ? "가르침 ●" : "가르침 ○"}</Chip>
        {result.chapter.stableAt && <Chip tone="ok">★ 안정</Chip>}
        {firstTaught && <span className="text-sm text-primary">처음으로 가르쳤습니다!</span>}
      </div><p className="mt-5 text-sm leading-7 text-muted">{remaining > 0 ? `아직 되짚지 않은 곳이 ${remaining}개 남아 있어요. 같은 목차를 다시 가르치며 설명을 채워 보세요.` : result.gaps.length > 0 ? `놓친 곳 ${result.gaps.length}개를 모두 되짚었어요.` : "이번 시험에서 놓친 곳이 없어요."}</p></section>
      </div>
      {error && <p role="alert" className="rounded-sm bg-danger-soft p-4 text-sm text-danger">{error} 다시 가르치기 버튼으로 재시도해 주세요.</p>}
      {juniorRun && inFinalStage(juniorRun) && <Card className="flex flex-col items-start gap-5 border-primary/20 bg-primary-soft p-6 sm:flex-row sm:items-center sm:p-8"><div className="min-w-0 flex-1"><p className="text-2xl font-semibold tracking-tight">{juniorRun.canGraduate ? "졸업시험 통과!" : isFinal ? "졸업시험에 다시 도전해요" : "모든 챕터를 통과했어요!"}</p><p className="mt-2 text-sm text-muted">{finalStageText(juniorRun)}</p></div><FinalExamAction run={juniorRun} size="lg" className="w-full sm:w-56 sm:shrink-0" /></Card>}
      {nextChapter && <Card className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:p-8"><div className="min-w-0 flex-1"><p className="mb-3 text-xs font-medium text-muted">다음 수업</p><p className="text-2xl font-semibold tracking-tight">{nextChapter.title}</p><p className="mt-2 text-sm text-muted">졸업까지 {juniorRun!.progress.cleared} / {juniorRun!.progress.total} 챕터 · {withJosa(juniorLabel(juniorRun!.character), "이/가")} 기다리고 있어요</p></div><div className="flex w-full flex-col gap-2 sm:w-56 sm:shrink-0"><Button size="lg" loading={busy} onClick={teachNext}>바로 가르치기 →</Button><Button size="sm" variant="ghost" onClick={() => router.push(`/materials/${encodeURIComponent(session.material.materialId)}/study/${encodeURIComponent(nextChapter.chapterId)}`)}>먼저 공부하기</Button></div></Card>}
      <div className="flex flex-col gap-3 border-t border-line pt-7 sm:flex-row sm:flex-wrap">{!isFinal && <Button size="lg" variant={nextChapter ? "secondary" : "primary"} loading={busy && !nextChapter} onClick={retryChapter}>같은 목차 다시 가르치기</Button>}<Button size="lg" variant="secondary" onClick={() => router.push(`/materials/${encodeURIComponent(session.material.materialId)}`)}>자료로 돌아가기</Button><Button size="lg" variant="ghost" onClick={() => router.push("/")}>홈</Button></div>
    </div>
  </div>;
}
