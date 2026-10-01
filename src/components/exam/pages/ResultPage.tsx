"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompleteResponse, GapDto, GradeDto, SessionDto } from "@/contracts/types";
import { api } from "@/components/session/_api";
import { useSession } from "@/components/session/useSession";
import { Mascot } from "@/components/mascot/Mascot";
import { SpeechBubble } from "@/components/session/SpeechBubble";
import { StepperHeader } from "@/components/session/StepperHeader";
import { Button, Card, Chip, ProgressBar } from "@/components/session/ui";
import { AnswerSheet } from "../AnswerSheet";
import { ReportCard } from "../ReportCard";
import { GradeBox, GradeVerdictChip } from "../verdict";
import { PageError, PageLoading, stream, useResultData, useTask } from "./shared";

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
  const initiated = useRef(false);
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
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [session.status, session.sessionId, run]);

  function complete() {
    void run(async (signal) => {
      await api.post<CompleteResponse>(`/sessions/${encodeURIComponent(session.sessionId)}/complete`);
      if (!signal.aborted) router.push(`/session/${encodeURIComponent(session.sessionId)}/complete`);
    });
  }

  return <div className="min-w-0 space-y-6">
    <StepperHeader session={session} step={3} chipLabel={result ? "시험 결과" : "채점 중"} subtitle="새내기의 답안에서 내 설명을 돌아보세요" />
    {result ? <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ReportCard courseName={session.material.courseName} {...result} gapCount={result.gaps.length} />
      <div className="min-w-0 space-y-5">
        <div className="flex justify-center"><Mascot state={result.finalVerdict === "STABLE" ? "cheer" : result.finalVerdict === "MOSTLY" ? "praise" : "encourage"} size={120} /></div>
        <SpeechBubble speaker="새내기" tail="top">배운 건 다 썼어. 못 쓴 데는 아직 못 들은 부분이야.</SpeechBubble>
        <div className="flex flex-col gap-3">
          {result.gaps.length > 0 && <Button size="lg" onClick={() => router.push(`/session/${encodeURIComponent(session.sessionId)}/review`)}>왜 틀렸는지 보기 →</Button>}
          <Button size="lg" variant={result.gaps.length ? "secondary" : "primary"} loading={busy} onClick={complete}>{result.gaps.some((gap) => gap.status !== "REVIEWED") ? "놓친 곳 남기고 끝내기" : "학습 마치기 →"}</Button>
          <Button variant="ghost" className="min-h-11" onClick={() => answerSheet.current?.scrollIntoView({ block: "start" })}>문항별 채점 다시 보기 ↓</Button>
        </div>
      </div>
    </div> : <div aria-live="polite" className="space-y-3">
      <h2 className="font-semibold tabular-nums">채점 진행 중 {Object.keys(grades).length} / {questions.length}</h2>
      <ProgressBar value={Object.keys(grades).length} max={questions.length} />
      {session.status === "EVALUATING" && !data.error && <PageLoading text="채점이 진행 중이에요. 저장된 결과를 기다리고 있습니다." />}
    </div>}
    {(error || data.error) && <PageError message={error || data.error!} retry={() => { void reload(); if (data.error) data.retry(); }} />}
    <div ref={answerSheet} className="grid min-w-0 scroll-mt-6 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <Card className="p-4"><h2 className="font-bold">문항별 채점</h2><ol className="mt-4 space-y-3">
        {questions.map((question) => {
          const grade = result?.items.find((item) => item.qid === question.qid)?.grade ?? grades[question.qid];
          return <li key={question.qid} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>문제 {question.order}</span>{grade ? <span className="font-semibold tabular-nums">{grade.score} / {grade.maxScore}</span> : <Chip tone={grading === question.qid ? "primary" : "muted"}>{grading === question.qid ? "채점 중" : "대기"}</Chip>}</li>;
        })}
      </ol></Card>
      <AnswerSheet courseName={session.material.courseName} instant items={questions.map((question) => {
        const item = result?.items.find((value) => value.qid === question.qid);
        const grade = item?.grade ?? grades[question.qid];
        return { ...question, text: item?.answer ?? session.exam?.answers.find((answer) => answer.qid === question.qid)?.answer ?? "", status: "done", unlearned: item?.sentences.some((sentence) => sentence.unlearned), badge: grade ? <GradeVerdictChip verdict={grade.verdict} /> : <Chip tone="muted">채점 전</Chip>, extra: <GradeBox grade={grade ?? null} state={grade ? "done" : grading === question.qid ? "grading" : "pending"} /> };
      })} />
    </div>
    {(result?.gaps ?? gaps).length > 0 && <Card className="p-5"><h2 className="font-bold">놓친 곳 · {(result?.gaps ?? gaps).length}군데</h2><ol className="mt-4 space-y-3">{(result?.gaps ?? gaps).map((gap, index) => <li key={gap.gapId} className="flex flex-wrap items-center gap-3 text-sm"><span className="text-muted tabular-nums">{index + 1}.</span><span className="min-w-0 break-words">{gap.title}</span><Chip tone={gap.status === "REVIEWED" ? "ok" : "warn"}>{gap.status === "REVIEWED" ? "되짚기 완료" : "확인 필요"}</Chip></li>)}</ol></Card>}
  </div>;
}
