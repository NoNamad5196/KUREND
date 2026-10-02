import { stripMarkdownBold } from "@/lib/shared/plain-text";
import { plainExamAnswer } from "@/lib/shared/exam-answer-text";
import { formatExamChoice } from "@/lib/shared/exam-format";
import clsx from "clsx";
import type { ReactNode } from "react";
import { TypingText } from "@/components/session/TypingText";
import { Chip } from "@/components/session/ui";
import { Choices } from "./Choices";

export type AnswerSheetItem = {
  qid: string; order: number; points: number; question: string; text: string;
  choices?: string[]; unlearned?: boolean; status?: "pending" | "writing" | "done";
  badge?: ReactNode; extra?: ReactNode;
};

// Cached SSE intentionally retains the stored answer for grading/evidence. Format only its display.
function displayAnswer(item: AnswerSheetItem): string {
  return item.choices?.length ? stripMarkdownBold(formatExamChoice(item.text)) : plainExamAnswer(item.text);
}

export function AnswerSheet({ studentName = "새내기", courseName, title = "새내기 시험 답안지", items, activeQid, instant = false, typingSpeedMs = 30, onTypingDone, className }: {
  studentName?: string; courseName: string; title?: string; items: AnswerSheetItem[]; activeQid?: string | null;
  instant?: boolean; typingSpeedMs?: number; onTypingDone?: (qid: string) => void; className?: string;
}) {
  return (
    <section aria-label={`${studentName} 답안지`} className={clsx("min-w-0 rounded-sm border border-paper-rule bg-paper p-5 text-paper-ink sm:p-8 lg:p-10", className)}>
      <header className="border-b border-paper-rule pb-6">
        <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <div><dt className="text-[11px] text-muted">성명</dt><dd className="mt-1.5 font-medium">{studentName}</dd></div>
          <div className="min-w-0"><dt className="text-[11px] text-muted">과목</dt><dd className="mt-1.5 break-words font-medium">{courseName}</dd></div>
          <div><dt className="text-[11px] text-muted">배점</dt><dd className="mt-1.5 font-medium tabular-nums">100점</dd></div>
        </dl>
      </header>
      <div className="divide-y divide-paper-rule">
        {items.map((item) => (
          <article key={item.qid} className="py-8 sm:py-10" aria-label={`${item.order}번 문항`}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="editorial-label flex items-baseline gap-3 text-muted"><span className="text-3xl font-medium tracking-tighter text-ink tabular-nums">{String(item.order).padStart(2, "0")}</span><span>{item.points}점</span></p>
              {item.badge}
            </div>
            <h3 className="mb-7 break-words text-xl font-semibold leading-relaxed tracking-tight sm:text-2xl">{stripMarkdownBold(item.question)}</h3>
            {item.choices && item.choices.length > 0 && <Choices choices={item.choices} answer={item.status === "done" || item.qid !== activeQid ? item.text : undefined} className="mb-7" />}
            <div className={clsx("exam-answer-text break-words whitespace-pre-wrap", item.choices?.length ? "min-h-20 rounded-sm border border-paper-rule bg-surface px-4 py-3 font-sans text-sm leading-7 sm:text-base" : "min-h-36 px-2 font-hand text-xl leading-9 sm:text-2xl", item.unlearned && "underline decoration-danger decoration-2 underline-offset-4")}
              style={item.choices?.length ? undefined : { backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 35px, var(--paper-rule) 35px, var(--paper-rule) 36px)" }}>
              {item.qid === activeQid && item.status === "writing" ? (
                <TypingText key={item.qid} text={displayAnswer(item)} speedMs={typingSpeedMs} instant={instant} cursor onDone={() => onTypingDone?.(item.qid)} />
              ) : displayAnswer(item) || <span className="font-sans text-sm text-muted">{item.status === "writing" ? "답을 떠올리고 있어요…" : "아직 작성하지 않았어요"}</span>}
            </div>
            {item.unlearned && <Chip tone="danger" className="mt-3">못 들은 부분</Chip>}
            {item.extra && <div className="mt-6 border-t border-paper-rule pt-5">{item.extra}</div>}
          </article>
        ))}
      </div>
    </section>
  );
}
