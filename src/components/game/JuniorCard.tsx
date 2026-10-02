/** 현재 후배의 진행 상태와 기존 이어하기·졸업 동작을 보여 주는 홈 스포트라이트. */
import Link from "next/link";
import type { ReactNode } from "react";
import { ProgressBar } from "@/components/session/ui";
import { FinalExamAction, finalStageText, inFinalStage } from "./FinalExamAction";
import { CHARACTER_META } from "./characters";
import { JuniorAvatar } from "./JuniorAvatar";
import { StaticBackdrop } from "./StaticBackdrop";
import { LifeHearts } from "./LifeHearts";
import { runStudyState, type RunStudyState } from "@/lib/client/home-study-state";
import type { RunSummary } from "./types";
import "./game.css";
import "./editorial.css";

export function JuniorCard({ run, study, intro, continueHref, meetHref = "/new" }: { run: RunSummary | null; study?: RunStudyState; intro?: ReactNode; continueHref?: string; meetHref?: string }) {
  if (!run) {
    return (
      <div className="junior-spotlight junior-spotlight-empty">
        <p className="junior-spotlight-label">함께 공부할 후배</p>
        <div className="junior-spotlight-art"><StaticBackdrop /><span className="junior-spotlight-orbit" aria-hidden="true" /><JuniorAvatar character="KU_HARD" size={270} pose="still" /></div>
        <div className="junior-spotlight-details">
          <h2>아직 가르치는 후배가 없어요</h2>
          <p className="mt-3 text-sm leading-6">공부할 자료를 올리고, 후배에게 설명하며 내 이해를 확인해 보세요.</p>
          <Link href={meetHref} className="junior-spotlight-cta">후배 만나기 <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    );
  }
  const meta = CHARACTER_META[run.character];
  const ended = run.status !== "ACTIVE";
  const current = study ?? runStudyState(run);
  return (
    <div className={intro ? "junior-spotlight junior-spotlight-home" : "junior-spotlight"}>
      <div className="junior-spotlight-scene">
        <div className="flex items-center justify-between gap-3">
          {intro ? <p className="junior-spotlight-student">{meta.name}</p> : <h2 className="junior-spotlight-student">{meta.name}</h2>}
          <LifeHearts lives={run.lives} maxLives={run.maxLives} size={19} />
        </div>
        <div className="junior-spotlight-art">
          <StaticBackdrop />
          <span className="junior-spotlight-orbit" aria-hidden="true" />
          <JuniorAvatar character={run.character} size={290} mood={run.lives === 1 ? "confused" : "idle"} pose="still" />
          <span className="junior-spotlight-difficulty">합격 {run.passScore}점<span>{meta.examLabel}</span></span>
        </div>
      </div>
      <div className="junior-spotlight-content">
        {intro}
        <div className="junior-spotlight-details">
          <p className="junior-spotlight-label mb-2">{run.courseName}</p>
          {intro ? <h2>{run.materialTitle}</h2> : <h3>{run.materialTitle}</h3>}
          <div className="junior-spotlight-progress">
            <div className="flex flex-wrap justify-between gap-2 text-xs"><span>통과한 목차</span><span className="font-semibold tabular-nums">{run.progress.cleared} / {run.progress.total}개</span></div>
            <ProgressBar value={run.progress.cleared} max={run.progress.total} />
          </div>
          <p className="junior-spotlight-next">
            {inFinalStage(run) ? finalStageText(run) : current.kind === "resume" ? <>진행 중인 목차 <span>{current.resume.chapterTitle}</span><span className="junior-spotlight-stage">{current.resume.stageLabel}</span></> : current.kind === "next" ? <>다음 목차 <span>{current.chapterTitle}</span></> : ended ? "이 후배와의 학습이 끝났어요." : "자료에서 학습할 목차를 확인해 주세요."}
          </p>
          {ended ? (
            <Link href={`/materials/${encodeURIComponent(run.materialId)}/junior`} className="junior-spotlight-cta">새 후배 만나기 <span aria-hidden="true">→</span></Link>
          ) : inFinalStage(run) ? (
            <FinalExamAction run={run} className="junior-spotlight-final-action" />
          ) : (
            <Link href={continueHref ?? (current.kind !== "final" ? current.href : `/materials/${encodeURIComponent(run.materialId)}`)} className="junior-spotlight-cta">{current.kind !== "final" ? current.label : "자료 보기"} <span aria-hidden="true">→</span></Link>
          )}
        </div>
      </div>
    </div>
  );
}
