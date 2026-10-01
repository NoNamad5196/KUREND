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
import { api, ApiError, routeForSession, sse } from "@/components/session/_api";
import { ObjectivesPanel } from "@/components/session/ObjectivesPanel";
import { SourcePeekButton } from "@/components/session/SourcePeekButton";
import { StepperHeader } from "@/components/session/StepperHeader";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { RunHeaderBadge } from "@/components/game/RunHeaderBadge";
import { useSessionGame } from "@/components/game/useSessionGame";
import { Button, Card, EmptyState, ProgressBar, Spinner, toast } from "@/components/session/ui";
import { useSession } from "@/components/session/useSession";
import { CHARACTER_META } from "@/components/game/characters";
import { coveredTeachingObjectives } from "@/lib/client/teaching-progress";
import { explanationRecovery, type ExplanationAttempt } from "@/lib/client/explanation-recovery";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";

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

type Pending = ExplanationAttempt & { failed: boolean; saved?: boolean };

export function TeachPage({ sessionId }: { sessionId: string }) {
  const { game, run, loading: gameLoading, error: gameError, reload: reloadGame } = useSessionGame(sessionId);
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
  const [directExplanation, setDirectExplanation] = useState(false);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const choicesAbortRef = useRef<AbortController | null>(null);
  const enrichmentRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const recoveryRef = useRef(false);

  useEffect(() => {
    setCovered(readCovered(sessionId));
  }, [sessionId]);
  useEffect(() => () => {
    abortRef.current?.abort();
    choicesAbortRef.current?.abort();
  }, []);

  const messages = useMemo(() => session?.messages ?? [], [session]);
  const userCount = useMemo(() => messages.filter((m) => m.role === "USER").length, [messages]);
  const lastMessage = messages.at(-1);
  const male = run?.character === "MALE_EASY";
  const restoredCovered = coveredTeachingObjectives(session?.objectives ?? [], covered, game?.mastery);
  const allObjectivesCovered = !!session?.objectives.length && restoredCovered.length === session.objectives.length;
  const waitingQuestion = male && lastMessage?.role === "JUNIOR" && lastMessage.stage === "QUESTION" ? lastMessage : null;
  const teachingChoices = waitingQuestion?.teachingChoices ?? [];

  // Existing sessions can predate teaching choices. Preparing an already active
  // session enriches its unanswered question without resetting its history/exam.
  const loadTeachingChoices = useCallback(async () => {
    choicesAbortRef.current?.abort();
    const ac = new AbortController();
    choicesAbortRef.current = ac;
    setChoicesLoading(true);
    setChoicesError(null);
    let received = false;
    try {
      await sse(`/sessions/${sessionId}/prepare`, { method: "GET" }, (name, data) => {
        if (name === "ready") {
          const next = (data as SseEventData<"ready">).session;
          received = !!next.messages.at(-1)?.teachingChoices?.length;
          setSession(next);
        }
      }, ac.signal);
      if (!received) setChoicesError("선택지를 준비하지 못했어요. 다시 시도하거나 직접 설명해 주세요.");
    } catch (e) {
      if (!ac.signal.aborted) setChoicesError(e instanceof ApiError ? e.message : "선택지를 불러오지 못했어요.");
    } finally {
      if (!ac.signal.aborted) setChoicesLoading(false);
    }
  }, [sessionId, setSession]);

  useEffect(() => {
    if (!waitingQuestion || allObjectivesCovered || teachingChoices.length || sending || enrichmentRef.current === waitingQuestion.messageId) return;
    enrichmentRef.current = waitingQuestion.messageId;
    void loadTeachingChoices();
  }, [waitingQuestion, allObjectivesCovered, teachingChoices.length, sending, loadTeachingChoices]);

  const pushMessage = useCallback(
    (m: MessageDto) => {
      setSession((prev) => (prev && !prev.messages.some((item) => item.messageId === m.messageId)
        ? { ...prev, messages: [...prev.messages, m] } : prev));
    },
    [setSession],
  );

  const restoreExplanation = useCallback(async (attempt: ExplanationAttempt) => {
    const next = await api.get<SessionDto>(`/sessions/${sessionId}`);
    const recovery = explanationRecovery(next.messages, attempt);
    setSession(next);
    if (next.status !== "EXPLAINING" || next.phase !== "QUESTION") router.replace(routeForSession(next));
    if (recovery.status === "answered") {
      setPending(null);
      setReactionText("");
      await reloadGame();
    } else {
      setPending({ ...attempt, failed: true,
        ...(recovery.status === "unanswered" ? { messageId: recovery.messageId, saved: true } : { saved: !!attempt.messageId }),
      });
    }
    return { next, recovery };
  }, [sessionId, setSession, router, reloadGame]);

  const send = useCallback(
    async (content: string, canonicalSession?: SessionDto) => {
      const current = canonicalSession ?? session;
      if (!current || sendingRef.current || recoveryRef.current || choicesLoading || finishing) return;
      const text = content.trim();
      if (!text) return;
      const previous = current.messages.at(-1);
      const attempt: ExplanationAttempt = { content: text, afterMessageId: previous?.messageId,
        ...(previous?.role === "USER" && previous.content === text ? { messageId: previous.messageId } : {}),
      };
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      sendingRef.current = true;
      setSending(true);
      setPending({ ...attempt, failed: false });
      setReactionText("");
      setDraft("");
      setDirectExplanation(false);
      const now = new Date().toISOString();
      let saved = !!attempt.messageId;
      let reported = false;
      let answered = false;
      try {
        await sse(
          `/sessions/${sessionId}/explanations`,
          { method: "POST", body: JSON.stringify({ content: text }) },
          (name, data) => {
            switch (name) {
              case "user.saved": {
                const d = data as SseEventData<"user.saved">;
                saved = true;
                attempt.messageId = d.messageId;
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
                answered = true;
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
                answered = true;
                setAnimateId(d.messageId);
                setCovered(d.coveredObjectives);
                writeCovered(sessionId, d.coveredObjectives);
                pushMessage({ messageId: d.messageId, role: "JUNIOR", stage: "QUESTION", content: d.content, createdAt: now,
                  ...(d.teachingChoices ? { teachingChoices: d.teachingChoices } : {}) });
                break;
              }
              case "error": {
                const d = data as SseEventData<"error">;
                reported = true;
                toast(d.message || "새내기가 답하지 못했습니다.", "error");
                setPending({ ...attempt, failed: true, saved });
                break;
              }
              default:
                break;
            }
          },
          ac.signal,
        );
        if (!answered) throw new Error("후배의 응답이 중단됐어요. 다시 보내 주세요.");
        void reloadGame();
      } catch (e) {
        if (ac.signal.aborted) return;
        setPending({ ...attempt, failed: true, saved });
        try {
          // The server commits the complete turn before sending its last SSE
          // events. Recover that turn first; never POST automatically on error.
          const { recovery } = await restoreExplanation(attempt);
          if (recovery.status === "answered") return;
        } catch {
          // Keep the retry action when the recovery GET also loses connection.
        }
        if (reported) {
          // error 이벤트에서 이미 안내함
        } else if (e instanceof ApiError && e.status === 409) {
          toast(e.message || "세션 상태가 바뀌었습니다. 다시 불러옵니다.", "error");
          void reload();
        } else {
          toast(e instanceof Error ? e.message : "네트워크 오류가 발생했습니다.", "error");
        }
      } finally {
        sendingRef.current = false;
        if (!ac.signal.aborted) {
          setSending(false);
          setReactionText("");
        }
      }
    },
    [session, choicesLoading, finishing, sessionId, pushMessage, setSession, reload, reloadGame, restoreExplanation],
  );

  const retryExplanation = useCallback(async (content: string) => {
    if (sendingRef.current || recoveryRef.current || choicesLoading || finishing) return;
    recoveryRef.current = true;
    setRecovering(true);
    const attempt: ExplanationAttempt = pending?.content === content ? pending : {
      content, ...(lastMessage?.role === "USER" && lastMessage.content === content ? { messageId: lastMessage.messageId } : {}),
    };
    try {
      const { next, recovery } = await restoreExplanation(attempt);
      if (recovery.status === "answered") return;
      if (recovery.status === "unknown") {
        toast("대화 상태가 바뀌었어요. 저장된 설명을 확인한 뒤 다시 시도해 주세요.", "error");
        return;
      }
      if (next.status !== "EXPLAINING" || next.phase !== "QUESTION") return;
      recoveryRef.current = false;
      await send(content, next);
    } catch {
      toast("저장된 설명을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.", "error");
    } finally {
      recoveryRef.current = false;
      setRecovering(false);
    }
  }, [pending, lastMessage, choicesLoading, finishing, restoreExplanation, send]);

  const finish = useCallback(async () => {
    if (!session || userCount === 0 || sending || recovering || choicesLoading || finishing) return;
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
  }, [session, userCount, sending, recovering, choicesLoading, finishing, sessionId, router, reload]);

  if (redirecting) return null;
  if ((loading && !session) || (session && session.sessionId !== sessionId) || (gameLoading && !game)) {
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
  if (gameError && !game) {
    return <EmptyState title="후배 정보를 불러오지 못했습니다" description="가르치는 방식을 확인하려면 다시 불러와 주세요." action={<Button onClick={() => void reloadGame()}>다시 시도</Button>} />;
  }

  const meta = run ? CHARACTER_META[run.character] : null;
  const interactionBusy = sending || recovering || choicesLoading || finishing;
  const recoveringExplanation = !sending && !pending && lastMessage?.role === "USER" ? lastMessage.content : null;
  const repeatConcepts = run?.character === "KU_HARD" ? game?.mastery.filter((item) => item.mastery < 100) ?? [] : [];
  const composerPlaceholder = run?.character === "FEMALE_NORMAL"
    ? "어떤 뜻인지, 왜 그런지 연결해서 설명해 주세요."
    : run?.character === "KU_HARD"
      ? "KU가 헷갈린 부분을 다른 표현이나 예시로 다시 설명해 주세요."
      : "후배에게 가르칠 내용을 직접 설명해 주세요.";

  return (
    <div className="study-page page-enter space-y-8">
      <StepperHeader
        session={session}
        step={1}
        chipLabel="가르치기"
        subtitle={meta ? `${meta.teachLabel} · 가르친 내용만 기억해요` : "새내기는 가르친 내용만 기억합니다"}
        right={
          <>
            <RunHeaderBadge run={run} />
            <SourcePeekButton materialId={session.material.materialId} chapterId={session.chapter.chapterId} />
            <Button variant="secondary" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen} aria-controls="study-objectives">
              {panelOpen ? "목표 닫기" : "학습 목표"}
            </Button>
          </>
        }
      />

      <div className="study-scene">
        <div className="study-scene-copy">
          <p className="editorial-label">LEARN BY TEACHING / 01</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">
            {meta ? `${meta.name}의 이해는,` : "후배의 이해는,"}<br />선배의 설명에서 시작돼요.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-muted">{meta?.teachingHint ?? "새내기의 질문에 선배의 말로 답해주세요."}</p>
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-primary">
            <span>{meta?.teachLabel ?? "직접 설명하기"}</span>
            <span className="font-mono tabular-nums">목표 {restoredCovered.length} / {session.objectives.length}</span>
          </p>
        </div>
        <div className="study-character">
          <span aria-hidden className="study-character-word">HELLO,<br />SENIOR.</span>
          <JuniorAvatar character={run?.character ?? "KU_HARD"} size={205} mood={sending ? "think" : lastMessage?.role === "JUNIOR" && lastMessage.stage === "DOUBT" ? "confused" : "idle"} enter />
        </div>
      </div>

      <div className="mx-auto max-w-[960px] space-y-6">
        {/* 한 화면에 이어지는 대화와 설명, 목표는 대화 아래 펼쳐본다. */}
        <section className="min-w-0 space-y-5" aria-label="대화">
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <h2 className="editorial-label">THE CONVERSATION</h2>
            <span className="text-xs text-muted">{meta?.name ?? "새내기"}와 함께하는 수업</span>
          </div>
          <Card className="study-dialogue overflow-hidden p-0">
            <ChatThread
              messages={messages}
              character={run?.character ?? "KU_HARD"}
              juniorName={run ? CHARACTER_META[run.character].name : "새내기"}
              pending={pending}
              reactionText={reactionText}
              sending={sending}
              animateId={animateId}
              onResend={(content) => void retryExplanation(content)}
            />
            {recovering && <p className="px-4 pb-3 text-sm text-muted" role="status">저장된 설명과 후배의 응답을 확인하고 있어요…</p>}
            {recoveringExplanation && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-muted" role="status">
                <p>마지막 설명은 저장됐어요. 후배의 응답을 이어서 받아 주세요.</p>
                <Button size="sm" variant="secondary" disabled={interactionBusy} onClick={() => void retryExplanation(recoveringExplanation)}>응답 다시 받기</Button>
              </div>
            )}
            {male && (
              <div className="space-y-4 border-t border-line bg-bg/50 p-4 sm:p-6">
                {allObjectivesCovered && !teachingChoices.length ? (
                  <div className="space-y-1" role="status">
                    <p className="text-sm font-semibold text-primary">모든 학습 목표를 다뤘어요. 이제 후배의 시험을 볼 수 있어요!</p>
                    <p className="text-xs leading-5 text-muted">더 알려줄 내용이 있다면 직접 설명해 주세요.</p>
                  </div>
                ) : choicesLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted" role="status"><Spinner /> 자료에서 가르칠 선택지를 준비하고 있어요…</p>
                ) : teachingChoices.length > 0 ? (
                  <fieldset disabled={interactionBusy}>
                    <legend className="mb-2 text-sm font-semibold">후배에게 알려줄 내용을 골라 주세요</legend>
                    <div className="grid gap-2">
                      {teachingChoices.map((choice) => (
                        <Button key={choice.id} variant="secondary" className="study-choice h-auto min-h-12 justify-start whitespace-normal px-4 py-4 text-left leading-6" onClick={() => void send(choice.text)}>
                          {choice.text}
                        </Button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted">내 답을 채점하는 퀴즈가 아니에요. 선택한 내용을 후배가 배우고 시험에 사용해요.</p>
                  </fieldset>
                ) : choicesError && waitingQuestion ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted" role="status">
                    <p>{choicesError}</p>
                    <Button size="sm" variant="secondary" disabled={interactionBusy} onClick={() => void loadTeachingChoices()}>선택지 다시 불러오기</Button>
                  </div>
                ) : null}
                <Button size="sm" variant="ghost" disabled={interactionBusy} aria-expanded={directExplanation} aria-controls="direct-explanation" onClick={() => setDirectExplanation((value) => !value)}>
                  {directExplanation ? "직접 설명 닫기" : "직접 설명하기"}
                </Button>
              </div>
            )}
            {(!male || directExplanation) && (
              <div id="direct-explanation">
                <Composer embedded value={draft} onChange={setDraft} onSend={() => void send(draft)} sending={sending} disabled={recovering || choicesLoading || finishing} placeholder={composerPlaceholder} />
              </div>
            )}
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
            <p className="text-xs text-muted">
              {userCount === 0 ? "설명을 한 번 이상 해야 시험을 볼 수 있어요." : `지금까지 ${userCount}번 설명했어요.`}
            </p>
            <Button variant="secondary" onClick={() => void finish()} disabled={userCount === 0 || sending || recovering || choicesLoading} loading={finishing}>
              그만 가르치고 시험 보기 →
            </Button>
          </div>
        </section>

        <div className="border-y border-line">
          <button type="button" className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-primary" aria-expanded={panelOpen} aria-controls="study-objectives" onClick={() => setPanelOpen((value) => !value)}>
            <span><span className="editorial-label mr-4">LESSON NOTES</span><span className="text-sm font-semibold">학습 목표와 들은 개념</span></span>
            <span aria-hidden className="text-2xl font-light">{panelOpen ? "−" : "+"}</span>
          </button>
          <aside id="study-objectives" className={clsx(panelOpen ? "block" : "hidden")} aria-label="학습 목표와 들은 개념">
          <div className="space-y-5 pb-6">
            <ObjectivesPanel objectives={session.objectives} covered={restoredCovered} heardConcepts={session.heardConcepts} collapsible={false} />
            {run?.character === "KU_HARD" && (
              <Card className="space-y-3 border-0 bg-bg p-4 sm:p-6">
                <h2 className="text-sm font-bold">KU의 기억 다지기</h2>
                <p className="text-xs leading-5 text-muted">들은 개념과 충분히 익힌 개념은 달라요. KU가 되말한 내용을 확인하고 다른 예시로 다시 설명해 주세요.</p>
                {repeatConcepts.length > 0 && (
                  <ul className="space-y-3" aria-live="polite">
                    {repeatConcepts.slice(0, 3).map((item) => (
                      <li key={item.concept} className="space-y-1">
                        <div className="flex items-start justify-between gap-2 text-xs"><span className="min-w-0 break-words font-semibold">{item.concept}</span><span className="shrink-0 text-muted">{item.exposureCount}번 들음</span></div>
                        <ProgressBar value={item.mastery} max={100} />
                        <p className="text-xs text-muted">아직 기억을 다지는 중</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export type { SessionDto };
