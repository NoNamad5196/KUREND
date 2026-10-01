"use client";
/**
 * §8-7 가르치기 화면 (핵심). POST /sessions/{id}/explanations SSE:
 * user.saved → junior.concepts → junior.doubt(턴 종료) | junior.token/message → junior.question → done
 */
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FinishExplanationResponse, MessageDto, SessionDto } from "@/contracts/types";
import type { SseEventData } from "@/contracts/events";
import { api, ApiError, sse } from "@/components/session/_api";
import { ObjectivesPanel } from "@/components/session/ObjectivesPanel";
import { SourcePeekButton } from "@/components/session/SourcePeekButton";
import { StepperHeader } from "@/components/session/StepperHeader";
import { RunHeaderBadge } from "@/components/game/RunHeaderBadge";
import { TeacherNotePeekButton } from "@/components/game/TeacherNotePeekButton";
import { useSessionGame } from "@/components/game/useSessionGame";
import { Button, Card, EmptyState, Spinner, toast } from "@/components/session/ui";
import { useSession } from "@/components/session/useSession";
import { CHARACTER_META } from "@/components/game/characters";
import { withJosa } from "@/components/game/JuniorOrMascot";
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

type Pending = { content: string; failed: boolean };

export function TeachPage({ sessionId }: { sessionId: string }) {
  const { run, loading: gameLoading, error: gameError, reload: reloadGame } = useSessionGame(sessionId);
  const router = useRouter();
  const { session, setSession, loading, error, redirecting, reload, recover } = useSession(
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
  const [turnError, setTurnError] = useState<string | null>(null);
  const [retryContent, setRetryContent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    setCovered(readCovered(sessionId));
    setDraft(""); setPending(null); setReactionText(""); setTurnError(null); setRetryContent(null); setSending(false);
    sendingRef.current = false;
    return () => abortRef.current?.abort();
  }, [sessionId]);

  const messages = useMemo(() => session?.messages ?? [], [session]);
  const userCount = useMemo(() => messages.filter((m) => m.role === "USER").length, [messages]);

  const pushMessage = useCallback(
    (m: MessageDto) => {
      setSession((prev) => (prev?.sessionId === sessionId ? { ...prev, messages: [...prev.messages.filter((item) => item.messageId !== m.messageId), m] } : prev));
    },
    [setSession, sessionId],
  );

  const send = useCallback(
    async (content: string) => {
      if (!session || sendingRef.current || gameLoading || gameError || finishing) return;
      const text = content.trim();
      if (!text) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      sendingRef.current = true;
      setSending(true);
      setTurnError(null); setRetryContent(null);
      setPending({ content: text, failed: false });
      setReactionText("");
      setDraft("");
      const now = new Date().toISOString();
      let saved = false;
      let failed = false;
      try {
        await sse(
          `/sessions/${sessionId}/explanations`,
          { method: "POST", body: JSON.stringify({ content: text }) },
          (name, data) => {
            if (ac.signal.aborted) return;
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
                // The shared parser throws the typed error after dispatch.
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
        if (recover(e)) return;
        failed = true;
        setTurnError(e instanceof ApiError ? e.message : "응답 연결을 확인하지 못했습니다. 다시 시도해 주세요.");
        if (saved) setRetryContent(text);
        if (!saved) setPending({ content: text, failed: true });
      } finally {
        if (!ac.signal.aborted) {
          const fresh = await reload();
          if (ac.signal.aborted) return;
          if (fresh) {
            const lastUser = fresh.messages.findLastIndex((item) => item.role === "USER");
            const stored = lastUser >= 0 && fresh.messages[lastUser].content === text;
            if (stored) {
              setPending(null);
              if (failed && lastUser === fresh.messages.length - 1) setRetryContent(text);
              else if (lastUser < fresh.messages.length - 1) { setTurnError(null); setRetryContent(null); }
            }
          }
          sendingRef.current = false;
          setSending(false);
          setReactionText("");
        }
      }
    },
    [session, sessionId, pushMessage, setSession, reload, recover, gameLoading, gameError, finishing],
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
  if ((loading && !session) || gameLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted">
        <Spinner className="mr-2" /> 세션을 불러오는 중…
      </div>
    );
  }
  if (error || gameError || !session) {
    return (
      <EmptyState
        title="세션을 불러오지 못했습니다"
        description={error?.message ?? gameError?.message}
        action={<><Button onClick={() => { void reload(); void reloadGame(); }}>다시 시도</Button><Link href={session ? `/materials/${session.material.materialId}` : "/"} className="ml-3 text-sm underline">자료로 돌아가기</Link></>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <StepperHeader
        session={session}
        step={1}
        chipLabel="가르치기"
        subtitle={`${withJosa(run ? CHARACTER_META[run.character].name : "새내기", "은/는")} 가르친 내용만 기억합니다`}
        right={
          <>
            <RunHeaderBadge run={run} />
            {run && <Link aria-disabled={sending} tabIndex={sending ? -1 : undefined} className={clsx("text-sm font-semibold text-primary", sending && "pointer-events-none opacity-50")}
              href={`/materials/${session.material.materialId}/junior?chapterId=${session.chapter.chapterId}&sessionId=${sessionId}`}>후배 변경</Link>}
            {!session.chapter.title.endsWith(" 졸업시험") && <TeacherNotePeekButton materialId={session.material.materialId} chapterId={session.chapter.chapterId} chapterTitle={session.chapter.title} />}
            <SourcePeekButton materialId={session.material.materialId} chapterId={session.chapter.chapterId} />
            <Button variant="secondary" className="lg:hidden" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen}>
              {panelOpen ? "목표 닫기" : "학습 목표"}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 대화 영역 — 하나의 채팅 스레드 + 입력창 */}
        <section className="min-w-0 space-y-3" aria-label="대화">
          <Card className="overflow-hidden p-0">
            <ChatThread
              messages={messages}
              character={session.character ?? run?.character ?? (session.juniorLevel === "HARD" ? "KU_HARD" : "MALE_EASY")}
              juniorName={run ? CHARACTER_META[run.character].name : "새내기"}
              pending={pending}
              reactionText={reactionText}
              sending={sending}
              animateId={animateId}
              onResend={(content) => void send(content)}
            />
            {turnError && <div role="alert" className="space-y-2 border-t border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
              <p>{turnError}</p>
              {retryContent && <Button size="sm" variant="secondary" disabled={sending} onClick={() => void send(retryContent)}>저장된 설명으로 다시 시도</Button>}
            </div>}
            <Composer embedded value={draft} onChange={setDraft} onSend={() => void send(draft)} sending={sending} disabled={finishing} />
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface/90 px-4 py-3 backdrop-blur">
            <p className="text-xs text-muted">
              {userCount === 0 ? "설명을 한 번 이상 해야 시험을 볼 수 있어요." : `지금까지 ${userCount}번 설명했어요.`}
            </p>
            <Button variant="secondary" onClick={() => void finish()} disabled={userCount === 0 || sending} loading={finishing}>
              그만 가르치고 시험 보기 →
            </Button>
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
