import clsx from "clsx";
import type { FinalVerdict } from "@/contracts/types";
import { VerdictChip } from "./verdict";

export function ReportCard({ studentName = "새내기", courseName, totalScore, questionCount, correctCount, partialCount, wrongCount, gapCount, finalVerdict, className }: {
  studentName?: string; courseName: string; totalScore: number; questionCount: number; correctCount: number; partialCount: number;
  wrongCount: number; gapCount: number; finalVerdict: FinalVerdict; className?: string;
}) {
  return <section className={clsx("min-w-0 rounded-card border border-paper-rule bg-paper p-6 text-paper-ink shadow-card sm:p-8", className)} aria-label="성적통지표">
    <p className="text-center text-xs tracking-widest text-muted">KUREND · 이번 학습 기록</p>
    <h2 className="mt-2 text-center text-2xl font-bold tracking-widest">성적통지표</h2>
    <dl className="mt-6 grid grid-cols-2 border-y border-paper-rule text-sm">
      <div className="p-3"><dt className="text-muted">성명</dt><dd className="mt-1 font-semibold">{studentName}</dd></div>
      <div className="min-w-0 border-l border-paper-rule p-3"><dt className="text-muted">과목</dt><dd className="mt-1 break-words font-semibold">{courseName}</dd></div>
    </dl>
    <div className="py-7 text-center"><p className="text-sm text-muted">총점</p><p className="mt-2 tabular-nums"><strong className="text-6xl font-bold tracking-tight">{totalScore}</strong><span className="ml-2 text-lg text-muted">/ 100</span></p><VerdictChip verdict={finalVerdict} className="mt-4" /></div>
    <dl className="grid grid-cols-4 divide-x divide-paper-rule border-y border-paper-rule py-4 text-center">
      {[["문항", questionCount], ["정답", correctCount], ["부분", partialCount], ["오답", wrongCount]].map(([label, count]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{count}</dd></div>)}
    </dl>
    <p className="mt-5 text-center text-sm">놓친 곳 <strong className="tabular-nums">{gapCount}군데</strong></p>
  </section>;
}
