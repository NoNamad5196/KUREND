"use client";

import { useRouter } from "next/navigation";
import type { CreateSessionResponse, ResultDto, SessionDto } from "@/contracts/types";
import { api } from "@/components/session/_api";
import { useSession } from "@/components/session/useSession";
import { Mascot } from "@/components/mascot/Mascot";
import { StepperHeader } from "@/components/session/StepperHeader";
import { Button, Card, Chip } from "@/components/session/ui";
import { ReportCard } from "../ReportCard";
import { PageError, PageLoading, useResultData, useTask } from "./shared";
import { RunHeaderBadge } from "@/components/game/RunHeaderBadge";
import { useSessionGame } from "@/components/game/useSessionGame";
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
  const { run: juniorRun, game } = useSessionGame(session.sessionId);
  const isFinal = game?.kind === "FINAL";
  const remaining = result.gaps.filter((gap) => gap.status !== "REVIEWED").length;
  const firstTaught = !!result.chapter.taughtAt && Date.parse(result.chapter.taughtAt) >= Date.parse(session.createdAt) && Date.parse(result.chapter.taughtAt) <= Date.parse(session.updatedAt);
  function retryChapter() {
    void run(async (signal) => {
      const next = await api.post<CreateSessionResponse>("/sessions", { chapterId: session.chapter.chapterId, juniorLevel: session.juniorLevel });
      if (!signal.aborted) router.push(`/session/${encodeURIComponent(next.sessionId)}/prepare`);
    });
  }
  return <div className="min-w-0 space-y-6">
    <StepperHeader session={session} step={4} chipLabel="완료" subtitle="오늘 가르친 내용을 학습 기록에 남겼어요" right={<RunHeaderBadge run={juniorRun} />} />
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-col items-center gap-3 text-center"><Mascot state={result.finalVerdict === "STABLE" ? "cheer" : result.finalVerdict === "MOSTLY" ? "praise" : "encourage"} size={144} /><h2 className="text-3xl font-bold tracking-tight">학습 완료</h2><p className="text-balance break-words text-lg">{session.chapter.title}</p></header>
      <ReportCard courseName={session.material.courseName} {...result} gapCount={result.gaps.length} />
      <p className="text-pretty px-2 text-center text-sm leading-7 text-muted">이 판정은 이번에 선배가 가르친 내용으로 새내기가 받은 결과입니다. 선배의 이해도 자체를 뜻하지 않습니다.</p>
      <Card className="p-5 sm:p-6"><h3 className="font-bold">이번 목차의 학습 기록</h3><div className="mt-4 flex flex-wrap items-center gap-3">
        <Chip tone={result.chapter.taughtAt ? "primary" : "muted"} className={firstTaught ? "motion-safe:animate-[pulse_600ms_ease-out_1]" : undefined}>{result.chapter.taughtAt ? "가르침 ●" : "가르침 ○"}</Chip>
        {result.chapter.stableAt && <Chip tone="ok">★ 안정</Chip>}
        {firstTaught && <span className="text-sm text-primary">처음으로 가르쳤습니다!</span>}
      </div><p className="mt-4 text-sm leading-6 text-muted">{remaining > 0 ? `아직 되짚지 않은 곳이 ${remaining}개 남아 있어요. 같은 목차를 다시 가르치며 설명을 채워 보세요.` : result.gaps.length > 0 ? `놓친 곳 ${result.gaps.length}개를 모두 되짚었어요.` : "이번 시험에서 놓친 곳이 없어요."}</p></Card>
      {error && <p role="alert" className="rounded-sm bg-danger-soft p-4 text-sm text-danger">{error} 다시 가르치기 버튼으로 재시도해 주세요.</p>}
      {juniorRun && inFinalStage(juniorRun) && <Card className="flex flex-col items-center gap-3 border-primary bg-primary-soft p-5 text-center sm:flex-row sm:text-left"><div className="min-w-0 flex-1"><p className="text-lg font-black">{juniorRun.canGraduate ? "졸업시험 통과!" : isFinal ? "졸업시험에 다시 도전해요" : "모든 챕터를 통과했어요!"}</p><p className="mt-1 text-sm text-muted">{finalStageText(juniorRun)}</p></div><FinalExamAction run={juniorRun} size="lg" className="sm:w-56" /></Card>}
      <div className="flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">{!isFinal && <Button size="lg" loading={busy} onClick={retryChapter}>같은 목차 다시 가르치기</Button>}<Button size="lg" variant="secondary" onClick={() => router.push(`/materials/${encodeURIComponent(session.material.materialId)}`)}>자료로 돌아가기</Button><Button size="lg" variant="ghost" onClick={() => router.push("/")}>홈</Button></div>
    </div>
  </div>;
}
