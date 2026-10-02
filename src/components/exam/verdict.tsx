import { stripMarkdownBold } from "@/lib/shared/plain-text";
import clsx from "clsx";
import type { FinalVerdict, GradeDto, GradeVerdict } from "@/contracts/types";
import { Chip, Spinner, type ChipTone } from "@/components/session/ui";

export const VERDICT_LABEL: Record<FinalVerdict, string> = { STABLE: "안정", MOSTLY: "대부분 이해", NEEDS_WORK: "보완 필요" };
export const GRADE_LABEL: Record<GradeVerdict, string> = { CORRECT: "정답", PARTIAL: "부분", WRONG: "오답" };
const verdictTone: Record<FinalVerdict, ChipTone> = { STABLE: "ok", MOSTLY: "warn", NEEDS_WORK: "muted" };
const gradeTone: Record<GradeVerdict, ChipTone> = { CORRECT: "ok", PARTIAL: "warn", WRONG: "danger" };

export function VerdictChip({ verdict, className }: { verdict: FinalVerdict; className?: string }) {
  return <Chip tone={verdictTone[verdict]} className={className}>{VERDICT_LABEL[verdict]}</Chip>;
}
export function GradeVerdictChip({ verdict, className }: { verdict: GradeVerdict; className?: string }) {
  return <Chip tone={gradeTone[verdict]} className={className}>{GRADE_LABEL[verdict]}</Chip>;
}
export function GradeBox({ grade, state, className }: { grade: GradeDto | null; state: "pending" | "grading" | "done"; className?: string }) {
  if (state === "grading") return <div className={clsx("flex items-center gap-2 text-sm text-primary", className)} role="status"><Spinner />채점 중</div>;
  if (state !== "done" || !grade) return <Chip tone="muted" className={className}>채점 전</Chip>;
  return <div className={clsx("rounded-sm border p-4", grade.verdict === "CORRECT" ? "border-ok/30 bg-ok/5" : grade.verdict === "PARTIAL" ? "border-warn/30 bg-accent-soft/50" : "border-danger/30 bg-danger-soft", className)}>
    <div className="flex flex-wrap items-center gap-3"><strong className="text-lg tabular-nums">{grade.score} / {grade.maxScore}</strong><GradeVerdictChip verdict={grade.verdict} /></div>
    <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6">{stripMarkdownBold(grade.comment)}</p>
  </div>;
}
