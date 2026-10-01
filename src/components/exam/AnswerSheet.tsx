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

export function AnswerSheet({ courseName, title = "2026학년도 KUREND 학력평가 답안지", items, activeQid, instant = false, typingSpeedMs = 30, onTypingDone, className }: {
  courseName: string; title?: string; items: AnswerSheetItem[]; activeQid?: string | null;
  instant?: boolean; typingSpeedMs?: number; onTypingDone?: (qid: string) => void; className?: string;
}) {
  return (
    <section aria-label="새내기 답안지" className={clsx("min-w-0 rounded-card border border-paper-rule bg-paper p-5 text-paper-ink shadow-card sm:p-8", className)}>
      <header className="border-b-2 border-paper-rule pb-5">
        <p className="mb-2 text-center text-xs tracking-widest text-muted">가르친 만큼, 기억한 만큼</p>
        <h2 className="text-balance text-center text-xl font-bold sm:text-2xl">{title}</h2>
        <dl className="mt-5 grid grid-cols-2 divide-x divide-paper-rule border border-paper-rule text-sm sm:grid-cols-3">
          <div className="p-3"><dt className="text-xs text-muted">성명</dt><dd className="mt-1 font-semibold">새내기</dd></div>
          <div className="min-w-0 p-3"><dt className="text-xs text-muted">과목</dt><dd className="mt-1 break-words font-semibold">{courseName}</dd></div>
          <div className="col-span-2 border-t border-paper-rule p-3 sm:col-span-1 sm:border-t-0"><dt className="text-xs text-muted">배점</dt><dd className="mt-1 font-semibold tabular-nums">100점</dd></div>
        </dl>
      </header>
      <div className="divide-y divide-paper-rule">
        {items.map((item) => (
          <article key={item.qid} className="py-6" aria-label={`${item.order}번 문항`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <h3 className="min-w-0 flex-1 break-words text-sm font-semibold leading-7 sm:text-base">
                <span className="mr-2 tabular-nums">{item.order}.</span><span className="mr-2 text-muted">[{item.points}점]</span>{item.question}
              </h3>
              {item.badge}
            </div>
            {item.choices && item.choices.length > 0 && <Choices choices={item.choices} answer={item.status === "done" || item.qid !== activeQid ? item.text : undefined} className="mb-4" />}
            <div className={clsx(item.choices?.length ? "min-h-20" : "min-h-36 break-words whitespace-pre-wrap px-2 font-hand text-xl leading-9 sm:text-2xl", item.unlearned && "underline decoration-danger decoration-2 underline-offset-4")}
              style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 35px, var(--paper-rule) 35px, var(--paper-rule) 36px)" }}>
              {item.qid === activeQid && item.status === "writing" ? (
                <TypingText key={item.qid} text={item.text} speedMs={typingSpeedMs} instant={instant} cursor onDone={() => onTypingDone?.(item.qid)} />
              ) : item.text || <span className="font-sans text-sm text-muted">{item.status === "writing" ? "답을 떠올리고 있어요…" : "아직 작성하지 않았어요"}</span>}
            </div>
            {item.unlearned && <Chip tone="danger" className="mt-3">못 들은 부분</Chip>}
            {item.extra && <div className="mt-4">{item.extra}</div>}
          </article>
        ))}
      </div>
    </section>
  );
}
