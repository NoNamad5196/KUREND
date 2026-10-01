"use client";
/**
 * [③] 졸업 단계 버튼 — Run 상태에 따라 [졸업시험 보기] / [졸업시험 이어하기] / [졸업하기] 중 하나.
 * 모든 챕터 통과 → 졸업시험(10문항, 객관식+서술형) → 통과하면 졸업식.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { gameApi } from "@/lib/client/game-api";
import { Button } from "@/components/session/ui";
import type { RunSummary } from "./types";

/** 졸업 단계에 들어섰나(이때만 버튼을 그린다) */
export const inFinalStage = (run: RunSummary | null | undefined) =>
  !!run && run.status === "ACTIVE" && (run.canGraduate || run.finalExam.status !== "LOCKED");

export function finalStageText(run: RunSummary): string {
  if (run.canGraduate) return "졸업시험 통과! 이제 졸업식을 열 수 있어요.";
  const { status, questionCount, bestScore } = run.finalExam;
  if (status === "IN_PROGRESS") return `졸업시험 진행 중 · ${questionCount}문항`;
  return `모든 챕터 통과! 졸업시험 ${questionCount}문항(객관식+서술형) · 합격 ${run.passScore}점${bestScore !== null ? ` · 최고 ${bestScore}점` : ""}`;
}

export function FinalExamAction({ run, size, className }: { run: RunSummary; size?: "md" | "lg"; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (run.canGraduate) {
    return <Link href={`/runs/${encodeURIComponent(run.runId)}/graduation`} className={className}><Button size={size} className="w-full">졸업하기 🎓</Button></Link>;
  }
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { sessionId } = await gameApi.startFinal(run.runId);
      router.push(`/session/${encodeURIComponent(sessionId)}/prepare`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "졸업시험을 시작하지 못했어요.");
      setBusy(false);
    }
  }
  return (
    <div className={className}>
      <Button size={size} className="w-full" loading={busy} onClick={() => void start()}>
        {run.finalExam.status === "IN_PROGRESS" ? "졸업시험 이어하기 →" : run.finalExam.attempts > 0 ? "졸업시험 다시 보기 📝" : "졸업시험 보기 📝"}
      </Button>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
