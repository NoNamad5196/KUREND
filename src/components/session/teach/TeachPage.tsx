"use client";
/**
 * §8-7 가르치기 화면 (핵심). POST /sessions/{id}/explanations SSE:
 * user.saved → junior.concepts → junior.doubt(턴 종료) | junior.token/message → junior.question → done
 */
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FinishExplanationResponse, MessageDto, SessionDto } from "@/contracts/types";
import type { SseEventData } from "@/contracts/events";
import { Mascot } from "@/components/mascot/Mascot";
import { api, ApiError, sse } from "@/components/session/_api";
import { ObjectivesPanel } from "@/components/session/ObjectivesPanel";
import { SourcePeekButton } from "@/components/session/SourcePeekButton";
import { SpeechBubble } from "@/components/session/SpeechBubble";
import { StepperHeader } from "@/components/session/StepperHeader";
import { RunHeaderBadge } from "@/components/game/RunHeaderBadge";
import { useSessionGame } from "@/components/game/useSessionGame";
import { TypingText } from "@/components/session/TypingText";
import { Button, Card, Chip, EmptyState, Spinner, toast } from "@/components/session/ui";
import { useSession } from "@/components/session/useSession";
import { Composer } from "./Composer";
import { groupTurns, TurnCard } from "./ConversationLog";

const coveredKey = (id: string) => `kurend.covered.${id}`;
function readCovered(id: string): string[] {
  try {
    const raw = window.localStorage.getItem(coveredKey(id));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeCovered(id: string, covered: string[]) {
  try {
    window.localStorage.setItem(coveredKey(id), JSON.stringify(covered));
  } catch {
    /* 저장 실패는 무시 */
  }
}

type Pending = { content: string; failed: boolean };

export function TeachPage({ sessionId }: { sessionId: string }) {
  const { run } = useSessionGame(sessionId);
  const router = useRouter();
  const { session, setSession, loading, error, redirecting, reload } = useSession(
    sessionId,
    (s) => s.status === "EXPLAINING" && s.phase === "QUESTION",
  );

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reactionText, setReactionText] = useState("");
  const [covered, setCovered] = useState<string[]>([]);
  const [animateId, setAnimateId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCovered(readCovered(sessionId));
  }, [sessionId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const messages = useMemo(() => session?.messages ?? [], [session]);
  const { history, current } = useMemo(() => groupTurns(messages), [messages]);
  const userCount = useMemo(() => messages.filter((m) => m.role === "USER").length, [messages]);
  const isDoubt = current?.stage === "DOUBT";

  // 새 메시지/반응이 생기면 아래로 스크롤
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, reactionText, pending]);

  const pushMessage = useCallback(
    (m: MessageDto) => {
      setSession((prev) => (prev ? { ...prev, messages: [...prev.messages, m] } : prev));
    },
    [setSession],
  );

  const send = useCallback(
    async (content: string) => {
      if (!session || sending) return;
      const text = content.trim();
      if (!text) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setSending(true);
      setPending({ content: text, failed: false });
      setReactionText("");
      setDraft("");
      const now = new Date().toISOString();
      let saved = false;
      let reported = false;
      try {
        await sse(
          `/sessions/${sessionId}/explanations`,
          { method: "POST", body: JSON.stringify({ content: text }) },
          (name, data) => {
            switch (name) {
              case "user.saved": {
                const d = data as SseEventData<"user.saved">;
                saved = true;
                pushMessage({ messageId: d.messageId, role: "USER", stage: "ANSWER", content: text, createdAt: now });
                setPending(null);
                break;
              }
              case "junior.concepts": {
                const d = data as SseEventData<"junior.concepts">;
                setSession((prev) => (prev ? { ...prev, heardConcepts: d.heardConcepts } : prev));
                break;
              }
              case "junior.doubt": {
                const d = data as SseEventData<"junior.doubt">;
                setAnimateId(d.messageId);
                pushMessage({ messageId: d.messageId, role: "JUNIOR", stage: "DOUBT", content: d.content, createdAt: now });
                break;
              }
              case "junior.token": {
                const d = data as SseEventData<"junior.token">;
                setReactionText((t) => (t ? `${t} ${d.token}` : d.token));
                break;
              }
              case "junior.message": {
                const d = data as SseEventData<"junior.message">;
                setReactionText("");
                pushMessage({ messageId: d.messageId, role: "JUNIOR", stage: "REACTION", content: d.content, createdAt: now });
                break;
              }
              case "junior.question": {
                const d = data as SseEventData<"junior.question">;
                setAnimateId(d.messageId);
                setCovered(d.coveredObjectives);
                writeCovered(sessionId, d.coveredObjectives);
                pushMessage({ messageId: d.messageId, role: "JUNIOR", stage: "QUESTION", content: d.content, createdAt: now });
                break;
              }
              case "error": {
                const d = data as SseEventData<"error">;
                reported = true;
                toast(d.message || "새내기가 답하지 못했습니다.", "error");
                if (!saved) setPending({ content: text, failed: true });
                break;
              }
              default:
                break;
            }
          },
          ac.signal,
        );
      } catch (e) {
        if (ac.signal.aborted) return;
        if (reported) {
          // error 이벤트에서 이미 안내함
        } else if (e instanceof ApiError && e.status === 409) {
          toast(e.message || "세션 상태가 바뀌었습니다. 다시 불러옵니다.", "error");
          void reload();
        } else {
          toast(e instanceof ApiError ? e.message : "네트워크 오류가 발생했습니다.", "error");
        }
        if (!saved) setPending({ content: text, failed: true });
      } finally {
        if (!ac.signal.aborted) {
          setSending(false);
          setReactionText("");
        }
      }
    },
    [session, sending, sessionId, pushMessage, setSession, reload],
  );

  const finish = useCallback(async () => {
    if (!session || userCount === 0 || sending) return;
    setFinishing(true);
    try {
      await api.post<FinishExplanationResponse>(`/sessions/${sessionId}/finish-explanation`);
      router.push(`/session/${sessionId}/exam`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "시험으로 넘어가지 못했습니다.";
      toast(msg, "error");
      if (e instanceof ApiError && e.status === 409 && e.code !== "NO_EXPLANATION") void reload();
      setFinishing(false);
    }
  }, [session, userCount, sending, sessionId, router, reload]);

  if (redirecting) return null;
  if (loading && !session) {
    return (
      <div className="flex items-center justify-center py-24 text-muted">
        <Spinner className="mr-2" /> 세션을 불러오는 중…
      </div>
    );
  }
  if (error || !session) {
    return (
      <EmptyState
        title="세션을 불러오지 못했습니다"
        description={error?.message}
        action={<Button onClick={() => void reload()}>다시 시도</Button>}
      />
    );
  }

  const mascotState = sending ? "thinking" : isDoubt ? "doubt" : "idle";

  return (
    <div className="space-y-5">
      <StepperHeader
        session={session}
        step={1}
        chipLabel="가르치기"
        subtitle="새내기는 가르친 내용만 기억합니다"
        right={
          <>
            {run ? (
              <RunHeaderBadge run={run} />
            ) : (
              <Chip tone={session.juniorLevel === "EASY" ? "primary" : "accent"}>
                {session.juniorLevel === "EASY" ? "쉽게" : "어렵게"}
              </Chip>
            )}
            <SourcePeekButton materialId={session.material.materialId} chapterId={session.chapter.chapterId} />
            <Button variant="secondary" className="lg:hidden" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen}>
              {panelOpen ? "목표 닫기" : "학습 목표"}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 대화 영역 */}
        <section className="min-w-0 space-y-4" aria-label="대화">
          {history.length > 0 && (
            <div className="kurend-stagger space-y-3">
              {history.map((t, i) => (
                <TurnCard key={t.key} turn={t} index={i} />
              ))}
            </div>
          )}

          {/* 현재 새내기 말풍선 */}
          <Card className="px-4 py-5 sm:px-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <div className="shrink-0 self-center sm:self-start">
                <Mascot state={mascotState} size={104} typing={sending && !reactionText && !current} />
              </div>
              <div className="min-w-0 flex-1 space-y-3" aria-live="polite">
                {pending && (
                  <div className="flex justify-end">
                    <SpeechBubble speaker={pending.failed ? "내 설명 · 전송 실패" : "내 설명 · 보내는 중"} tone="user" tail="none" className="kurend-pop max-w-[92%] opacity-90">
                      {pending.content}
                      {pending.failed && (
                        <div className="mt-2">
                          <Button size="sm" variant="secondary" onClick={() => void send(pending.content)}>
                            다시 보내기
                          </Button>
                        </div>
                      )}
                    </SpeechBubble>
                  </div>
                )}
                {reactionText && (
                  <SpeechBubble speaker="새내기 · 반응" tone="muted" tail="left" className="kurend-pop">
                    <TypingText text={reactionText} speedMs={20} cursor />
                  </SpeechBubble>
                )}
                {current && !sending && (
                  <SpeechBubble
                    key={current.messageId}
                    speaker={isDoubt ? "새내기 · 되물음" : "새내기 · 질문"}
                    tone={isDoubt ? "doubt" : "default"}
                    size="lg"
                    tail="left"
                    className={animateId === current.messageId ? (isDoubt ? "kurend-doubt" : "kurend-pop") : undefined}
                  >
                    <TypingText text={current.content} speedMs={20} instant={animateId !== current.messageId} />
                  </SpeechBubble>
                )}
                {!current && !sending && !pending && (
                  <SpeechBubble speaker="새내기" tone="muted" tail="left">
                    응응, 더 말해 줘! 궁금한 거 생기면 물어볼게.
                  </SpeechBubble>
                )}
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <Composer value={draft} onChange={setDraft} onSend={() => void send(draft)} sending={sending} />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface/90 px-4 py-3 backdrop-blur">
              <p className="text-xs text-muted">
                {userCount === 0 ? "설명을 한 번 이상 해야 시험을 볼 수 있어요." : `지금까지 ${userCount}번 설명했어요.`}
              </p>
              <Button variant="secondary" onClick={() => void finish()} disabled={userCount === 0 || sending} loading={finishing}>
                그만 가르치고 시험 보기 →
              </Button>
            </div>
            <div ref={endRef} />
          </div>
        </section>

        {/* 보조 패널 */}
        <aside className={clsx("lg:block", panelOpen ? "block" : "hidden")} aria-label="학습 목표와 들은 개념">
          <div className="lg:sticky lg:top-4">
            <ObjectivesPanel objectives={session.objectives} covered={covered} heardConcepts={session.heardConcepts} collapsible={false} />
          </div>
        </aside>
      </div>
    </div>
  );
}

export type { SessionDto };
