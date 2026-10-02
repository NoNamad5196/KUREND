import clsx from "clsx";
import type { RecallLevel } from "@/contracts/types";
import { Card, Chip } from "@/components/session/ui";

export function RecallPanel({ sources, highlights, unlearned, className, title = "새내기가 떠올리는 내 설명" }: {
  sources: Array<{ ref: number; content: string }>; highlights: Record<number, RecallLevel>;
  unlearned?: boolean; className?: string; title?: string;
}) {
  return (
    <Card className={clsx("min-w-0 border-0 border-t border-line bg-transparent py-6 shadow-none", className)}>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-xs leading-5 text-muted">새내기가 어떤 설명을 기억했는지 함께 살펴보세요.</p>
      {unlearned && <div className="mt-4"><Chip tone="danger">못 들은 부분</Chip><p className="mt-2 text-sm text-muted">이 답에 필요한 내용을 설명에서 찾지 못했어요.</p></div>}
      <div className="mt-5 space-y-4" aria-live="polite">
        {sources.length === 0 ? <p className="py-6 text-center text-sm text-muted">떠올릴 설명이 없어요</p> : sources.map((source) => {
          const level = highlights[source.ref];
          return <blockquote key={source.ref} className={clsx("border-l-2 py-2 pl-4 pr-2 transition-colors", level === "STRONG" ? "border-primary bg-primary-soft" : level === "FAINT" ? "border-primary/40 bg-primary-soft/40" : "border-line bg-transparent")}>
            <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold"><span>내 설명 #{source.ref}</span><span className="text-muted">{level === "STRONG" ? "또렷하게 기억" : level === "FAINT" ? "희미하게 기억" : ""}</span></div>
            <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6">{source.content}</p>
          </blockquote>;
        })}
      </div>
    </Card>
  );
}
