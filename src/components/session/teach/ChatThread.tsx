"use client";
/**
 * [③] 가르치기 대화 스레드 — 메신저처럼 한 줄기로 이어진다.
 * 왼쪽: 후배(질문·되물음·반응), 오른쪽: 내 설명. 마지막 후배 말풍선만 타이핑 연출.
 * 보내는 중이면 내 말풍선(보내는 중) → 후배 타이핑 점 → 반응 토큰 스트리밍 → 다음 질문 순으로 자연스럽게 붙는다.
 */
import clsx from "clsx";
import { useEffect, useRef, type ReactNode } from "react";
import type { MessageDto } from "@/contracts/types";
import { JuniorAvatar, type JuniorMood } from "@/components/game/JuniorAvatar";
import type { JuniorCharacter } from "@/components/game/types";
import { TypingText } from "@/components/session/TypingText";
import { Button } from "@/components/session/ui";

type Group = { role: "USER" | "JUNIOR"; items: MessageDto[]; key: string };

function groupMessages(messages: MessageDto[]): Group[] {
  const groups: Group[] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    if (last && last.role === m.role) last.items.push(m);
    else groups.push({ role: m.role, items: [m], key: m.messageId });
  }
  return groups;
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function Bubble({ side, tone = "default", size = "md", label, className, children }: { side: "left" | "right"; tone?: "default" | "doubt" | "reaction" | "user" | "pending"; size?: "md" | "lg"; label?: string; className?: string; children: ReactNode }) {
  const toneCls = {
    default: "bg-surface border-line text-ink",
    doubt: "bg-accent-soft border-accent text-ink",
    reaction: "bg-bg border-line text-muted",
    user: "bg-primary text-primary-ink border-primary",
    pending: "bg-primary/70 text-primary-ink border-transparent",
  }[tone];
  return (
    <div className={clsx("flex w-full", side === "right" ? "justify-end" : "justify-start")}>
      <div className={clsx("relative max-w-[86%] rounded-2xl border px-4 py-2.5 leading-7 shadow-[0_1px_0_rgba(30,35,48,.04)]", side === "left" ? "rounded-tl-md" : "rounded-tr-md", size === "lg" ? "text-base sm:text-lg" : "text-[15px]", toneCls, className)}>
        {label && <span className={clsx("mb-0.5 block text-[11px] font-bold tracking-wide", tone === "user" || tone === "pending" ? "text-primary-ink/80" : tone === "doubt" ? "text-[#8A5A00]" : "text-muted")}>{label}</span>}
        <div className="whitespace-pre-wrap break-words">{children}</div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1" aria-label="입력 중">
      <i className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
      <i className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
      <i className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
    </span>
  );
}

export function ChatThread({
  messages,
  character = "KU_HARD",
  juniorName = "새내기",
  pending,
  reactionText,
  sending,
  animateId,
  onResend,
  className,
}: {
  messages: MessageDto[];
  character?: JuniorCharacter;
  juniorName?: string;
  pending: { content: string; failed: boolean } | null;
  reactionText: string;
  sending: boolean;
  animateId: string | null;
  onResend: (content: string) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const groups = groupMessages(messages);
  const lastJunior = [...messages].reverse().find((m) => m.role === "JUNIOR");
  const lastIsDoubt = lastJunior?.stage === "DOUBT" && messages[messages.length - 1]?.messageId === lastJunior.messageId;
  const mood: JuniorMood = sending ? "think" : lastIsDoubt ? "confused" : "idle";

  // 새 말풍선이 생기면 스레드 안에서만 아래로 스크롤(페이지는 안 움직인다)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, reactionText, pending, sending]);

  const avatar = (m: JuniorMood, key: string) => (
    <div key={key} className="w-11 shrink-0 self-end sm:w-12">
      <JuniorAvatar character={character} size={48} mood={m} />
    </div>
  );

  return (
    <div ref={scrollRef} className={clsx("min-h-[320px] max-h-[62vh] overflow-y-auto px-3 py-4 sm:px-5", className)} aria-live="polite" aria-label="대화">
      <div className="space-y-4">
        {groups.length === 0 && !pending && (
          <div className="flex items-end gap-2">
            {avatar("talk", "empty")}
            <Bubble side="left" label={juniorName}>응응, 더 말해 줘! 궁금한 거 생기면 물어볼게.</Bubble>
          </div>
        )}
        {groups.map((g, gi) => {
          const isLastGroup = gi === groups.length - 1;
          if (g.role === "USER") {
            return (
              <div key={g.key} className="space-y-1.5">
                {g.items.map((m, i) => (
                  <Bubble key={m.messageId} side="right" tone="user" label={i === 0 ? "내 설명" : undefined}>{m.content}</Bubble>
                ))}
                <p className="pr-1 text-right text-[11px] text-muted">{formatTime(g.items[g.items.length - 1].createdAt)}</p>
              </div>
            );
          }
          return (
            <div key={g.key} className="flex items-end gap-2">
              {avatar(isLastGroup && !sending && !pending ? mood : "idle", `${g.key}-avatar`)}
              <div className="min-w-0 flex-1 space-y-1.5">
                {g.items.map((m) => {
                  const isDoubt = m.stage === "DOUBT";
                  const isReaction = m.stage === "REACTION";
                  const isLatest = isLastGroup && m.messageId === g.items[g.items.length - 1].messageId;
                  const animate = animateId === m.messageId;
                  return (
                    <Bubble
                      key={m.messageId}
                      side="left"
                      tone={isDoubt ? "doubt" : isReaction ? "reaction" : "default"}
                      size={isLatest && !isReaction ? "lg" : "md"}
                      label={isDoubt ? `${juniorName} · 되물음` : isReaction ? undefined : `${juniorName} · 질문`}
                      className={animate ? (isDoubt ? "kurend-doubt" : "kurend-pop") : undefined}
                    >
                      {animate ? <TypingText text={m.content} speedMs={18} /> : m.content}
                    </Bubble>
                  );
                })}
              </div>
            </div>
          );
        })}

        {pending && (
          <Bubble side="right" tone={pending.failed ? "user" : "pending"} label={pending.failed ? "내 설명 · 전송 실패" : "내 설명 · 보내는 중"} className="kurend-pop">
            {pending.content}
            {pending.failed && (
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => onResend(pending.content)}>다시 보내기</Button>
              </div>
            )}
          </Bubble>
        )}
        {sending && (
          <div className="flex items-end gap-2">
            {avatar(reactionText ? "talk" : "think", "typing-avatar")}
            <Bubble side="left" tone={reactionText ? "reaction" : "default"} className="kurend-pop">
              {reactionText ? <TypingText text={reactionText} speedMs={20} cursor /> : <TypingDots />}
            </Bubble>
          </div>
        )}
      </div>
    </div>
  );
}
