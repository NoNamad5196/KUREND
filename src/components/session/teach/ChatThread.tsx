"use client";
/**
 * [③] 가르치기 대화 스레드 — 메신저처럼 한 줄기로 이어진다.
 * 왼쪽: 후배(질문·되물음·반응), 오른쪽: 내 설명. 마지막 후배 말풍선만 타이핑 연출.
 * 보내는 중이면 내 말풍선(보내는 중) → 후배 타이핑 점 → 반응 토큰 스트리밍 → 다음 질문 순으로 자연스럽게 붙는다.
 */
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import clsx from "clsx";
import { useEffect, useRef, type ReactNode } from "react";
import type { MessageDto } from "@/contracts/types";
import type { JuniorCharacter } from "@/components/game/types";
import { TypingText } from "@/components/session/TypingText";
import { Button } from "@/components/session/ui";
import { normalizePersonaAddress } from "@/lib/llm/personas";

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
    default: "bg-surface border-transparent text-ink",
    doubt: "bg-accent-soft border-accent text-ink",
    reaction: "bg-transparent border-transparent text-muted",
    user: "bg-primary-soft text-ink border-transparent",
    pending: "bg-primary-soft/70 text-ink border-transparent",
  }[tone];
  return (
    <div className={clsx("flex w-full", side === "right" ? "justify-end" : "justify-start")}>
      <div className={clsx("relative max-w-full rounded-sm border px-4 py-4 leading-7 sm:max-w-[88%] sm:px-5", size === "lg" ? "text-base sm:text-lg" : "text-[15px]", toneCls, className)}>
        {label && <span className={clsx("mb-2 block text-[11px] font-semibold tracking-wide", tone === "user" || tone === "pending" || tone === "doubt" ? "text-primary" : "text-muted")}>{label}</span>}
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
  pending: { content: string; failed: boolean; saved?: boolean } | null;
  reactionText: string;
  sending: boolean;
  animateId: string | null;
  onResend: (content: string) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const groups = groupMessages(messages);
  const emptyGreeting = character === "MALE_EASY"
    ? "이 개념의 뜻을 알려주시겠습니까?"
    : character === "FEMALE_NORMAL" ? "어떤 뜻인지 이유와 함께 설명해 주실래요?"
      : "선배, 천천히 설명해 줘. 내가 이해한 걸 다시 말해 볼게.";

  // 새 말풍선이 생기면 스레드 안에서만 아래로 스크롤(페이지는 안 움직인다)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, reactionText, pending, sending]);

  return (
    <div ref={scrollRef} className={clsx("study-thread min-h-[300px] max-h-[62vh] overflow-y-auto px-2 py-6 sm:px-6 sm:py-8", className)} aria-live="polite" aria-label="대화">
      <div className="space-y-6">
        {groups.length === 0 && !pending && (
          <div className="flex items-end gap-2">
            <Bubble side="left" label={juniorName}>{emptyGreeting}</Bubble>
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
                <p className="pr-1 text-right font-mono text-[10px] text-muted">{formatTime(g.items[g.items.length - 1].createdAt)}</p>
              </div>
            );
          }
          return (
            <div key={g.key} className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                {g.items.map((m) => {
                  const isDoubt = m.stage === "DOUBT";
                  const isReaction = m.stage === "REACTION";
                  const isLatest = isLastGroup && m.messageId === g.items[g.items.length - 1].messageId;
                  const animate = animateId === m.messageId;
                  const content = normalizePersonaAddress(stripMarkdownBold(m.content), character, { kind: isReaction ? "reaction" : "question" });
                  return (
                    <Bubble
                      key={m.messageId}
                      side="left"
                      tone={isDoubt ? "doubt" : isReaction ? "reaction" : "default"}
                      size={isLatest && !isReaction ? "lg" : "md"}
                      label={isDoubt ? `${juniorName} · 되물음` : isReaction ? undefined : `${juniorName} · 질문`}
                      className={animate ? (isDoubt ? "kurend-doubt" : "kurend-pop") : undefined}
                    >
                      {animate ? <TypingText text={content} speedMs={18} /> : stripMarkdownBold(content)}
                    </Bubble>
                  );
                })}
              </div>
            </div>
          );
        })}

        {pending && !pending.saved && (
          <Bubble side="right" tone={pending.failed ? "user" : "pending"} label={pending.failed ? "내 설명 · 전송 실패" : "내 설명 · 보내는 중"} className="kurend-pop">
            {pending.content}
            {pending.failed && (
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => onResend(pending.content)}>다시 보내기</Button>
              </div>
            )}
          </Bubble>
        )}
        {pending?.failed && pending.saved && (
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted" role="status">
            <span>설명은 저장됐어요. 후배의 응답을 다시 받아 주세요.</span>
            <Button size="sm" variant="secondary" disabled={sending} onClick={() => onResend(pending.content)}>다시 보내기</Button>
          </div>
        )}
        {sending && (
          <div className="flex items-end gap-2">
            <Bubble side="left" tone={reactionText ? "reaction" : "default"} className="kurend-pop">
              {reactionText ? <TypingText text={normalizePersonaAddress(stripMarkdownBold(reactionText, { streaming: true }), character, { kind: "reaction" })} speedMs={20} cursor streaming /> : <TypingDots />}
            </Bubble>
          </div>
        )}
      </div>
    </div>
  );
}
