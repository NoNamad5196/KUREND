/**
 * 말풍선. tone: default | doubt(노란 "되물음") | user(내 설명) | muted | paper. size lg = 최신 질문용 큰 글씨.
 */
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import clsx from "clsx";
import type { ReactNode } from "react";

export type BubbleTone = "default" | "doubt" | "user" | "muted" | "paper";

const TONE: Record<BubbleTone, { box: string; speaker: string; tail: string }> = {
  default: { box: "bg-surface border-line", speaker: "text-muted", tail: "bg-surface border-line" },
  doubt: { box: "bg-accent-soft border-accent", speaker: "text-primary", tail: "bg-accent-soft border-accent" },
  user: { box: "bg-primary-soft border-transparent", speaker: "text-primary", tail: "bg-primary-soft border-transparent" },
  muted: { box: "bg-bg border-line text-muted", speaker: "text-muted", tail: "bg-bg border-line" },
  paper: { box: "bg-paper border-paper-rule text-paper-ink", speaker: "text-muted", tail: "bg-paper border-paper-rule" },
};

export function SpeechBubble({
  speaker,
  tone = "default",
  size = "md",
  tail = "none",
  className,
  children,
}: {
  speaker?: string;
  tone?: BubbleTone;
  size?: "md" | "lg";
  tail?: "left" | "top" | "bottom" | "none";
  className?: string;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      className={clsx(
        "kurend-bubble relative max-w-full rounded-sm border",
        size === "lg" ? "px-5 py-5 text-lg leading-relaxed sm:px-7 sm:text-xl" : "px-4 py-4 text-sm leading-7",
        t.box,
        className,
      )}
    >
      {tail !== "none" && (
        <span
          aria-hidden
          className={clsx(
            "absolute h-3.5 w-3.5 rotate-45 border",
            t.tail,
            tail === "left" && "-left-[8px] top-6 border-r-0 border-t-0",
            tail === "top" && "-top-[8px] left-8 border-b-0 border-r-0",
            tail === "bottom" && "-bottom-[8px] left-8 border-l-0 border-t-0",
          )}
        />
      )}
      {speaker && <span className={clsx("mb-3 block text-[11px] font-semibold tracking-wide", t.speaker)}>{speaker}</span>}
      <div className="relative">{typeof children === "string" && tone !== "user" ? stripMarkdownBold(children) : children}</div>
    </div>
  );
}
