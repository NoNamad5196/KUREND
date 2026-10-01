/** 현재 후배의 진행 상태와 기존 이어하기·졸업 동작을 보여 주는 홈 스포트라이트. */
import Link from "next/link";
import { ProgressBar } from "@/components/session/ui";
import { FinalExamAction, finalStageText, inFinalStage } from "./FinalExamAction";
import { CHARACTER_META } from "./characters";
import { JuniorAvatar } from "./JuniorAvatar";
import { LifeHearts } from "./LifeHearts";
import type { RunSummary } from "./types";
import "./game.css";
import "./editorial.css";

export function JuniorCard({ run, continueHref, meetHref = "/new" }: { run: RunSummary | null; continueHref?: string; meetHref?: string }) {
  if (!run) {
    return (
      <div className="junior-spotlight junior-spotlight-empty">
        <p className="editorial-label">YOUR NEXT STUDY PARTNER</p>
        <div className="junior-spotlight-art"><span className="junior-spotlight-orbit" aria-hidden="true" /><JuniorAvatar character="KU_HARD" size={270} pose="still" /></div>
        <div className="junior-spotlight-details">
          <h2>아직 가르치는<br />후배가 없어요</h2>
          <p className="mt-3 text-sm leading-6">공부할 자료를 올리고, 후배에게 설명하며 내 이해를 확인해 보세요.</p>
          <Link href={meetHref} className="junior-spotlight-cta">후배 만나기 <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    );
  }
  const meta = CHARACTER_META[run.character];
  const ended = run.status !== "ACTIVE";
  const href = continueHref ?? (run.next ? `/materials/${run.materialId}` : `/materials/${run.materialId}`);
  return (
    <div className="junior-spotlight">
      <div className="flex items-center justify-between gap-3">
        <p className="editorial-label">YOUR STUDY PARTNER</p>
        <LifeHearts lives={run.lives} maxLives={run.maxLives} size={19} />
      </div>
      <div className="junior-spotlight-art">
        <span className="junior-spotlight-orbit" aria-hidden="true" />
        <span className="junior-spotlight-name" aria-hidden="true">{meta.name}</span>
        <JuniorAvatar character={run.character} size={290} mood={run.lives === 1 ? "confused" : "idle"} pose="still" />
        <span className="junior-spotlight-difficulty">{meta.difficulty}<span>{meta.examLabel}</span></span>
      </div>
      <div className="junior-spotlight-details">
        <p className="editorial-label mb-2">{run.courseName}</p>
        <h2>{run.materialTitle}</h2>
        <div className="junior-spotlight-progress">
          <div className="flex flex-wrap justify-between gap-2 text-xs"><span>챕터 학습 진행</span><span className="font-semibold tabular-nums">{run.progress.cleared} / {run.progress.total} CHAPTER</span></div>
          <ProgressBar value={run.progress.cleared} max={run.progress.total} />
        </div>
        <p className="junior-spotlight-next">
          {inFinalStage(run) ? finalStageText(run) : run.next ? <>다음 수업 <span>{run.next.title}</span></> : "다음 수업이 없습니다"}
        </p>
        {ended ? (
          <Link href={`/materials/${run.materialId}/junior`} className="junior-spotlight-cta">새 후배 만나기 <span aria-hidden="true">↗</span></Link>
        ) : inFinalStage(run) ? (
          <FinalExamAction run={run} className="junior-spotlight-final-action" />
        ) : (
          <Link href={href} className="junior-spotlight-cta">계속 가르치기 <span aria-hidden="true">↗</span></Link>
        )}
      </div>
    </div>
  );
}
