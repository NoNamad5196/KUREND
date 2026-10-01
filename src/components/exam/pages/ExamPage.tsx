"use client";
import { stripMarkdownBold } from "@/lib/shared/plain-text";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionDto, StartExamResponse } from "@/contracts/types";
import type { JuniorCharacter } from "@/contracts/game";
import { api } from "@/components/session/_api";
import { useSession } from "@/components/session/useSession";
import { SpeechBubble } from "@/components/session/SpeechBubble";
import { StepperHeader } from "@/components/session/StepperHeader";
import { RunHeaderBadge } from "@/components/game/RunHeaderBadge";
import { useSessionGame } from "@/components/game/useSessionGame";
import { JuniorOrMascot, juniorLabel, withJosa } from "@/components/game/JuniorOrMascot";
import { Button, Card, Chip, ProgressBar } from "@/components/session/ui";
import { AnswerSheet } from "../AnswerSheet";
import { RecallPanel } from "../RecallPanel";
import { useExamViewSettings, ViewSettingsMenu } from "../ViewSettings";
import { emptyPlayback, reduceAnswer, type AnswerPlayback } from "./exam-state";
import { PageError, PageLoading, stream, useTask } from "./shared";

const EXAM_INTRO: Record<JuniorCharacter, string> = {
  MALE_EASY: "지금까지 알려주신 내용으로 한번 풀어보겠습니다!",
  FEMALE_NORMAL: "지금까지 알려주신 내용으로 한번 풀어볼게요!",
  KU_HARD: "나 이제 시험 볼게! 배운 만큼만 답할게. 끝날 때까지 조용히 지켜봐 줘.",
};

export function ExamPage({ sessionId }: { sessionId: string }) {
  const state = useSession(sessionId, (session) => session.status === "EXAM_IN_PROGRESS" || (session.status === "EXPLAINING" && session.phase === "EXAM_READY"));
  if (state.error) return <PageError message={state.error.message} retry={() => void state.reload()} />;
  if (!state.session || state.loading || state.redirecting) return <PageLoading />;
  return <ExamContent key={sessionId} session={state.session} reload={state.reload} />;
}

function ExamContent({ session: initial, reload }: { session: SessionDto; reload: () => Promise<unknown> }) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const { run: juniorRun, loading: gameLoading, identityPending } = useSessionGame(initial.sessionId);
  const character = session.character ?? juniorRun?.character;
  const [settings, updateSettings] = useExamViewSettings();
  const { busy, error, run } = useTask(reload);
  const [answers, setAnswers] = useState<Record<string, AnswerPlayback>>(() => Object.fromEntries((initial.exam?.answers ?? []).map((answer) => [answer.qid, { ...emptyPlayback(), text: answer.answer, saved: true, cached: true }])));
  const questions = [...(session.exam?.questions ?? [])].sort((a, b) => a.order - b.order);
  const [activeQid, setActiveQid] = useState<string | null>(() => questions.find((question) => !initial.exam?.answers.some((answer) => answer.qid === question.qid))?.qid ?? questions[0]?.qid ?? null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [thoughtHidden, setThoughtHidden] = useState(false);
  const started = useRef(false);
  const active = answers[activeQid ?? ""];
  const activeIndex = questions.findIndex((question) => question.qid === activeQid);
  const completed = questions.filter((question) => answers[question.qid]?.saved).length;
  const allDone = questions.length > 0 && completed === questions.length;
  const next = questions.find((question) => !answers[question.qid]?.saved);
  const typingFinished = !active || active.cached || settings.instant || typed[activeQid ?? ""] === active.text;

  const play = useCallback((qid: string) => {
    void run(async (signal) => {
      setActiveQid(qid); setThoughtHidden(false);
      setTyped((value) => ({ ...value, [qid]: "" }));
      const sources = session.messages.filter((message) => message.role === "USER").map((message, index) => ({ ref: index + 1, content: message.content }));
      setAnswers((value) => ({ ...value, [qid]: { ...emptyPlayback(), sources } }));
      let saved = false;
      await stream(`/sessions/${encodeURIComponent(session.sessionId)}/exam/answers`, { qid }, signal, (event) => {
        if (!("qid" in event.data) || event.data.qid !== qid) return;
        if (event.event === "answer.saved") saved = true;
        setAnswers((value) => ({ ...value, [qid]: reduceAnswer(value[qid] ?? emptyPlayback(), event) }));
      });
      if (!signal.aborted && !saved) throw new Error("답안 저장을 확인하지 못했어요. 이 문항을 다시 시도해 주세요.");
    });
  }, [run, session.messages, session.sessionId]);

  useEffect(() => {
    if (session.status !== "EXAM_IN_PROGRESS" || started.current || !activeQid) return;
    const timer = setTimeout(() => { started.current = true; play(activeQid); }, 0);
    return () => clearTimeout(timer);
  }, [session.status, activeQid, play]);

  useEffect(() => {
    if (!active?.thoughtClosed) return;
    const timer = setTimeout(() => setThoughtHidden(true), 2000);
    return () => clearTimeout(timer);
  }, [active?.thoughtClosed, activeQid]);

  useEffect(() => {
    if (!settings.autoAdvance || busy || error || !active?.saved || !typingFinished || !next) return;
    const timer = setTimeout(() => play(next.qid), 1000);
    return () => clearTimeout(timer);
  }, [settings.autoAdvance, busy, error, active?.saved, typingFinished, next, play]);

  function startExam() {
    void run(async (signal) => {
      const response = await api.post<StartExamResponse>(`/sessions/${encodeURIComponent(session.sessionId)}/start-exam`);
      if (signal.aborted) return;
      setSession((value) => ({ ...value, status: response.status, exam: { ...response.exam, status: "IN_PROGRESS", answers: [] } }));
      setActiveQid([...response.exam.questions].sort((a, b) => a.order - b.order)[0]?.qid ?? null);
    });
  }

  if (!character && gameLoading) return <PageLoading />;

  return <div className="page-enter min-w-0 space-y-8 sm:space-y-10">
    <StepperHeader session={session} step={2} chipLabel="시험" subtitle={`${withJosa(juniorLabel(character), "이/가")} 선배에게 배운 내용만으로 시험을 봅니다`} right={<RunHeaderBadge run={juniorRun} />} />
    {session.status === "EXPLAINING" ? <Card className="mx-auto grid max-w-4xl items-center gap-8 overflow-hidden p-6 sm:grid-cols-[minmax(0,1fr)_200px] sm:p-10 lg:p-14">
      <div className="min-w-0">
        <p className="editorial-label text-muted">TIME TO REMEMBER</p>
        <h2 className="mt-4 text-3xl leading-tight font-semibold tracking-tighter sm:text-4xl">가르친 만큼,<br />기억한 만큼.</h2>
        <div className="mt-6"><SpeechBubble speaker={juniorLabel(character)} tail="none">{character ? EXAM_INTRO[character] : "배운 내용을 바탕으로 시험을 시작할게요."}</SpeechBubble></div>
        <p className="mt-6 border-t border-line pt-5 text-sm text-muted">{questions.some((q) => q.choices?.length) ? "객관식" : "서술형"} {questions.length || 3}문항 · 총 100점</p>
        <Button size="lg" className="mt-5 w-full sm:w-auto" loading={busy} onClick={startExam}>시험 시작 →</Button>
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      </div>
      <div className="flex justify-center border-t border-line pt-6 sm:border-t-0 sm:pt-0"><JuniorOrMascot character={character} identityPending={identityPending} state="writing" size={184} /></div>
    </Card> : <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div aria-live="polite"><p className="editorial-label mb-3 text-muted">THE EXAM</p><h2 className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{allDone && !busy ? "답안 작성 완료" : `답안 작성 중 ${Math.max(1, activeIndex + 1)} / ${questions.length}`}</h2><p className="mt-2 text-xs text-muted">{completed}문항 저장됨</p></div>
        <ViewSettingsMenu value={settings} onChange={updateSettings} />
      </div>
      <ProgressBar value={completed} max={questions.length} />
      <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-10">
        <div className="min-w-0 space-y-6">
          <AnswerSheet studentName={juniorLabel(character)} courseName={session.material.courseName} activeQid={activeQid} instant={settings.instant || active?.cached} onTypingDone={(qid) => setTyped((value) => ({ ...value, [qid]: answers[qid]?.text ?? "" }))}
            items={questions.filter((question) => question.qid === activeQid).map((question) => ({ ...question, text: active?.text ?? "", unlearned: active?.unlearned, status: active?.cached ? "done" : "writing", badge: <Chip tone={active?.saved ? "ok" : "muted"}>{active?.saved ? "작성 완료" : "작성 중"}</Chip> }))} />
          <nav aria-label="시험 문항" className="flex flex-wrap items-center justify-center gap-2 border-y border-line py-4">
            <Button variant="ghost" className="min-h-11 min-w-11" aria-label="이전 문항" disabled={busy || activeIndex <= 0} onClick={() => play(questions[activeIndex - 1].qid)}>◁</Button>
            {questions.map((question) => <Button key={question.qid} variant={activeQid === question.qid ? "primary" : "secondary"} className="min-h-11 min-w-11" aria-label={`${question.order}번 문항${answers[question.qid]?.saved ? ", 작성 완료" : ""}`} aria-current={activeQid === question.qid ? "page" : undefined} disabled={busy || (!answers[question.qid]?.saved && question.qid !== next?.qid)} onClick={() => play(question.qid)}>{question.order}</Button>)}
            <Button variant="ghost" className="min-h-11 min-w-11" aria-label="다음 문항" disabled={busy || activeIndex >= questions.length - 1 || !active?.saved || !typingFinished} onClick={() => play(questions[activeIndex + 1].qid)}>▷</Button>
          </nav>
          {error && <PageError message={error} retry={() => activeQid && play(activeQid)} />}
          <div className="flex justify-end [&>button]:h-auto [&>button]:min-h-12 [&>button]:whitespace-normal [&>button]:py-3">
            {allDone ? <Button size="lg" disabled={busy || !typingFinished || !!error} onClick={() => router.push(`/session/${encodeURIComponent(session.sessionId)}/result`)}>답안 제출하고 채점 받기 →</Button> : <Button size="lg" loading={busy} disabled={!active?.saved || !typingFinished || !!error} onClick={() => next && play(next.qid)}>다음 문항 풀기 ({Math.min(completed + 1, questions.length)} / {questions.length}) →</Button>}
          </div>
        </div>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-28">
          <div className="flex items-center gap-4 py-2"><JuniorOrMascot character={character} identityPending={identityPending} state={busy ? "writing" : "idle"} size={88} />
            {settings.showThought && active?.thought && !thoughtHidden ? <SpeechBubble speaker={`${juniorLabel(character)} · 속마음`} tone="muted" className="min-w-0 flex-1"><span className="break-words" aria-live="polite">{stripMarkdownBold(active.thought, { streaming: busy })}</span></SpeechBubble> : <p className="text-sm text-muted">{busy ? "배운 내용을 떠올리고 있어요…" : "선배의 설명을 기억했어요."}</p>}
          </div>
          <RecallPanel title={`${withJosa(juniorLabel(character), "이/가")} 떠올리는 내 설명`} sources={active?.sources ?? []} highlights={active?.highlights ?? {}} unlearned={active?.unlearned} />
        </aside>
      </div>
    </>}
  </div>;
}
