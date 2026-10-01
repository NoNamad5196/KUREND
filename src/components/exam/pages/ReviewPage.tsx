"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TUTOR_PRESET_REQUEST, type CompleteResponse, type GapDto, type ResultDto, type ReviewedResponse, type SessionDto } from "@/contracts/types";
import { api } from "@/components/session/_api";
import { useSession } from "@/components/session/useSession";
import { StepperHeader } from "@/components/session/StepperHeader";
import { SourceDrawer } from "@/components/session/SourceDrawer";
import { SpeechBubble } from "@/components/session/SpeechBubble";
import { Button, Card, Chip, EmptyState, ProgressBar } from "@/components/session/ui";
import { LearningErrorFeedback } from "../LearningErrorFeedback";
import { PageError, PageLoading, stream, useResultData, useTask } from "./shared";

export function ReviewPage({ sessionId }: { sessionId: string }) {
  const state = useSession(sessionId, ["RESULT_READY", "REVIEWING"]);
  const data = useResultData(sessionId, !!state.session && !state.redirecting, false, state.reload);
  if (state.error || data.error) return <PageError message={state.error?.message ?? data.error!} retry={() => { void state.reload(); data.retry(); }} />;
  if (!state.session || !data.result || state.loading || state.redirecting) return <PageLoading />;
  return <ReviewContent key={sessionId} session={state.session} initialResult={data.result} reload={state.reload} />;
}

function ReviewContent({ session, initialResult, reload }: { session: SessionDto; initialResult: ResultDto; reload: () => Promise<unknown> }) {
  const router = useRouter();
  const [result, setResult] = useState(initialResult);
  const [selectedId, setSelectedId] = useState(initialResult.gaps.find((gap) => gap.status === "FOUND")?.gapId ?? initialResult.gaps[0]?.gapId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(initialResult.gaps.map((gap) => [gap.gapId, gap.status !== "REVIEWED"])));
  const [source, setSource] = useState<GapDto | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const { busy, error, run } = useTask(reload);
  const remaining = result.gaps.filter((gap) => gap.status !== "REVIEWED").length;
  const selected = result.gaps.find((gap) => gap.gapId === selectedId);

  function markReviewed(gap: GapDto) {
    void run(async (signal) => {
      setReviewingId(gap.gapId);
      const response = await api.post<ReviewedResponse>(`/sessions/${encodeURIComponent(session.sessionId)}/gaps/${encodeURIComponent(gap.gapId)}/reviewed`);
      if (signal.aborted) return;
      setResult((value) => ({ ...value, status: "REVIEWING", gaps: value.gaps.map((item) => item.gapId === response.gapId ? { ...item, status: response.status } : item) }));
      setExpanded((value) => ({ ...value, [gap.gapId]: false }));
      setSelectedId(result.gaps.find((item) => item.gapId !== gap.gapId && item.status === "FOUND")?.gapId ?? gap.gapId);
    });
  }
  function complete() {
    void run(async (signal) => {
      setReviewingId(null);
      await api.post<CompleteResponse>(`/sessions/${encodeURIComponent(session.sessionId)}/complete`);
      if (!signal.aborted) router.push(`/session/${encodeURIComponent(session.sessionId)}/complete`);
    });
  }

  return <div className="page-enter min-w-0 space-y-8 sm:space-y-10">
    <StepperHeader session={session} step={4} chipLabel="되짚기" subtitle="자료와 내 설명을 나란히 보고, 놓친 개념을 채워 보세요" />
    <div className="flex flex-wrap items-end justify-between gap-5"><div aria-live="polite"><p className="editorial-label mb-3 text-muted">FILL IN THE GAPS</p><h2 className="text-3xl font-semibold tracking-tighter sm:text-4xl">놓친 곳 되짚기 · {result.gaps.length}곳</h2><p className="mt-3 text-sm text-muted">{remaining === 0 ? "모든 곳을 되짚었어요. 학습을 마칠 수 있어요." : `${result.gaps.length - remaining}곳 완료 · ${remaining}곳 남았어요`}</p></div><Button size="lg" disabled={remaining > 0} loading={busy && reviewingId === null} onClick={complete}>되짚기 마치기 →</Button></div>
    {result.gaps.length > 0 && <ProgressBar value={result.gaps.length - remaining} max={result.gaps.length} />}
    {error && <p role="alert" className="rounded-sm bg-danger-soft p-4 text-sm text-danger">{error} 해당 버튼으로 다시 시도해 주세요.</p>}
    <div className="grid min-w-0 items-start gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {result.gaps.length === 0 && <Card><EmptyState title="놓친 곳이 없어요" description="가르친 내용이 답안에 잘 담겼어요. 학습을 마쳐 보세요." /></Card>}
        {result.gaps.map((gap, index) => <section key={gap.gapId} className="min-w-0 border-t border-line py-6 sm:py-8">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
            <h3 className="w-full min-w-0 flex-1"><Button variant="ghost" className="h-auto min-h-11 w-full items-start justify-start gap-4 whitespace-normal px-0 text-left" aria-expanded={expanded[gap.gapId]} aria-controls={`gap-${gap.gapId}`} onClick={() => { setExpanded((value) => ({ ...value, [gap.gapId]: !value[gap.gapId] })); setSelectedId(gap.gapId); }}><span className="text-2xl font-medium tracking-tight text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 break-words text-xl leading-relaxed font-semibold tracking-tight">{gap.title}</span></Button></h3>
            <Chip className="sm:mt-2" tone={gap.status === "REVIEWED" ? "ok" : "warn"}>{gap.status === "REVIEWED" ? "✓ 되짚기 완료" : "확인 필요"}</Chip>
          </div>
          {expanded[gap.gapId] && <div id={`gap-${gap.gapId}`} className="mt-6 space-y-7 sm:pl-12">
            <section><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-semibold tracking-wide text-muted">자료에서는</h4><Button variant="ghost" className="min-h-11" onClick={() => setSource(gap)}>자료에서 보기 ↗</Button></div><blockquote className="mt-2 break-words whitespace-pre-wrap border-l-2 border-primary bg-paper px-5 py-4 text-sm leading-7 text-paper-ink">{gap.sourceExcerpt}</blockquote></section>
            <section><h4 className="text-xs font-semibold tracking-wide text-muted">진단</h4><p className="mt-3 break-words whitespace-pre-wrap text-sm leading-7">{gap.diagnosis}</p></section>
            <LearningErrorFeedback {...gap} answer={result.items.find((item) => item.qid === gap.qid)?.answer} />
            <div className="flex flex-wrap gap-2">{gap.concepts.map((concept) => <span key={concept} className="max-w-full break-words rounded-sm bg-primary-soft px-3 py-1 text-xs text-primary">{concept}</span>)}</div>
            <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" className="min-h-11" aria-pressed={selectedId === gap.gapId} onClick={() => setSelectedId(gap.gapId)}>이 부분 튜터에게 묻기</Button><Button className="min-h-11" disabled={busy || gap.status === "REVIEWED"} loading={busy && reviewingId === gap.gapId} onClick={() => markReviewed(gap)}>이해했어요 ✓</Button></div>
          </div>}
        </section>)}
        <Button variant="ghost" className="mt-4 min-h-11" onClick={() => router.push(`/session/${encodeURIComponent(session.sessionId)}/result`)}>← 성적표로 돌아가기</Button>
      </div>
      {selected && <TutorPanel key={`${selected.gapId}-${selected.status}`} sessionId={session.sessionId} gap={selected} reload={reload} onSaved={(messages) => setResult((value) => ({ ...value, gaps: value.gaps.map((gap) => gap.gapId === selected.gapId ? { ...gap, tutorMessages: messages } : gap) }))} />}
    </div>
    <SourceDrawer open={!!source} onClose={() => setSource(null)} materialId={session.material.materialId} chapterId={session.chapter.chapterId} highlight={source?.sourceExcerpt} title="자료에서 확인하기" />
  </div>;
}

function TutorPanel({ sessionId, gap, reload, onSaved }: { sessionId: string; gap: GapDto; reload: () => Promise<unknown>; onSaved: (messages: GapDto["tutorMessages"]) => void }) {
  const { busy, error, run } = useTask(reload);
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState("");
  const [request, setRequest] = useState("");
  const [messages, setMessages] = useState(gap.tutorMessages);
  const [failedRequest, setFailedRequest] = useState<string | undefined>();
  function ask(content?: string) {
    void run(async (signal) => {
      setFailedRequest(content); setResponse(""); setRequest(content ?? TUTOR_PRESET_REQUEST);
      let saved = false;
      await stream(`/sessions/${encodeURIComponent(sessionId)}/tutor`, { gapId: gap.gapId, ...(content ? { content } : {}) }, signal, (event) => {
        if (event.event === "tutor.token") setResponse((value) => value + event.data.token);
        if (event.event === "tutor.message" && event.data.gapId === gap.gapId) {
          saved = true;
          // SSE에는 createdAt이 없어 수신 시각을 표시용으로 보관한다. 새로고침 시 서버 기록으로 복원된다.
          const updatedMessages = [...messages.filter((message) => message.id !== event.data.id), { id: event.data.id, request: event.data.request, response: event.data.response, createdAt: new Date().toISOString() }];
          setMessages(updatedMessages);
          onSaved(updatedMessages);
          setResponse(""); setRequest(""); setQuestion("");
        }
      });
      if (signal.aborted) return;
      if (!saved) throw new Error("튜터 답변이 중단됐어요. 다시 시도해 주세요.");
    });
  }
  return <Card className="min-w-0 p-5 sm:p-6 xl:sticky xl:top-28">
    <p className="editorial-label mb-3 text-muted">A LITTLE GUIDANCE</p><h2 className="text-2xl font-semibold tracking-tight">AI 튜터</h2><p className="mt-3 break-words text-sm leading-6 text-muted">{gap.title}</p>
    <div className="mt-5 max-h-[28rem] space-y-4 overflow-y-auto overscroll-contain" aria-label="튜터 대화">
      {messages.map((message) => <div key={message.id} className="space-y-3 border-t border-line pt-4"><p className="break-words whitespace-pre-wrap border-l-2 border-primary pl-3 text-sm leading-6">{message.request}</p><SpeechBubble speaker="AI 튜터" tail="none"><p className="break-words whitespace-pre-wrap text-sm leading-7">{message.response}</p></SpeechBubble></div>)}
      {request && <div className="space-y-2"><p className="break-words whitespace-pre-wrap text-sm text-muted">{request}</p><SpeechBubble speaker="AI 튜터" tail="none"><p className="break-words whitespace-pre-wrap text-sm leading-7" aria-live="polite">{response || "자료를 바탕으로 설명을 준비하고 있어요…"}</p></SpeechBubble></div>}
    </div>
    {error && <PageError message={error} retry={() => ask(failedRequest)} />}
    <Button variant="secondary" className="mt-5 h-auto min-h-11 w-full whitespace-normal py-2" disabled={busy} onClick={() => ask()}>이 부분 쉽게 설명 받기</Button>
    <form className="mt-6 space-y-3 border-t border-line pt-5" onSubmit={(event) => { event.preventDefault(); if (question.trim() && !busy) ask(question.trim()); }}>
      <label htmlFor={`tutor-${gap.gapId}`} className="text-sm font-semibold">더 궁금한 점</label>
      <textarea id={`tutor-${gap.gapId}`} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={busy} maxLength={2000} rows={3} placeholder="어떤 부분이 헷갈리나요?" className="w-full resize-y rounded-sm border border-line bg-bg p-3 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50" />
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted tabular-nums">{question.length} / 2000</span><Button type="submit" className="min-h-11" loading={busy} disabled={!question.trim()}>질문</Button></div>
    </form>
  </Card>;
}
