import clsx from "clsx";
import type { FinalVerdict } from "@/contracts/types";
import { VerdictChip } from "./verdict";

export function ReportCard({ courseName, totalScore, questionCount, correctCount, partialCount, wrongCount, gapCount, finalVerdict, className }: {
  courseName: string; totalScore: number; questionCount: number; correctCount: number; partialCount: number;
  wrongCount: number; gapCount: number; finalVerdict: FinalVerdict; className?: string;
}) {
  return <section className={clsx("min-w-0 rounded-sm border border-paper-rule bg-paper p-6 text-paper-ink sm:p-8 lg:p-10", className)} aria-label="성적통지표">
    <p className="editorial-label text-muted">SESSION REPORT · 이번 학습 기록</p>
    <h2 className="mt-3 text-3xl font-semibold tracking-tighter sm:text-4xl">성적통지표</h2>
    <dl className="mt-6 grid grid-cols-2 gap-5 border-t border-paper-rule pt-5 text-sm">
      <div><dt className="text-xs text-muted">성명</dt><dd className="mt-1.5 font-medium">새내기</dd></div>
      <div className="min-w-0"><dt className="text-xs text-muted">과목</dt><dd className="mt-1.5 break-words font-medium">{courseName}</dd></div>
    </dl>
    <div className="flex flex-wrap items-end justify-between gap-5 py-8 sm:py-10"><div><p className="editorial-label text-muted">TOTAL SCORE</p><p className="mt-2 tabular-nums"><strong className="text-7xl leading-none font-medium tracking-[-0.07em] sm:text-8xl">{totalScore}</strong><span className="ml-3 text-base text-muted">/ 100</span></p></div><VerdictChip verdict={finalVerdict} className="mb-1" /></div>
    <dl className="grid grid-cols-4 gap-2 border-y border-paper-rule py-5">
      {[["문항", questionCount], ["정답", correctCount], ["부분", partialCount], ["오답", wrongCount]].map(([label, count]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-2 text-2xl font-medium tracking-tight tabular-nums">{count}</dd></div>)}
    </dl>
    <p className="mt-5 flex justify-between gap-3 text-sm text-muted"><span>놓친 곳</span><strong className="font-medium text-ink tabular-nums">{gapCount}군데</strong></p>
  </section>;
}
