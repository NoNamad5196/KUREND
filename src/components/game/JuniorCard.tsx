/**
 * [③] 홈 상단 현재 후배 카드 — 캐릭터·난이도·LIFE·자료·졸업까지 n/m·다음 수업·[계속 가르치기]. run 이 없으면 "후배 만나기" CTA.
 */
import Link from "next/link";
import { Button, Card, ProgressBar } from "@/components/session/ui";
import { CharacterBadge } from "./CharacterBadge";
import { FinalExamAction, finalStageText, inFinalStage } from "./FinalExamAction";
import { CHARACTER_META } from "./characters";
import { JuniorAvatar } from "./JuniorAvatar";
import { LifeHearts } from "./LifeHearts";
import type { RunSummary } from "./types";
import "./game.css";

export function JuniorCard({ run, continueHref, meetHref = "/new" }: { run: RunSummary | null; continueHref?: string; meetHref?: string }) {
  if (!run) {
    return (
      <Card className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        <JuniorAvatar character="KU_HARD" size={120} mood="think" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black">아직 가르치는 후배가 없어요</p>
          <p className="mt-1 text-sm text-muted">자료를 올리고 후배를 고르면, 졸업시키기 게임이 시작됩니다.</p>
        </div>
        <Link href={meetHref}><Button>후배 만나기 →</Button></Link>
      </Card>
    );
  }
  const meta = CHARACTER_META[run.character];
  const ended = run.status !== "ACTIVE";
  const href = continueHref ?? (run.next ? `/materials/${run.materialId}` : `/materials/${run.materialId}`);
  return (
    <Card className="relative overflow-hidden p-0">
      <div className="absolute inset-y-0 right-0 w-1/3 opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${meta.soft})` }} aria-hidden="true" />
      <div className="relative grid gap-4 p-5 sm:grid-cols-[140px_1fr_auto] sm:items-center">
        <div className="mx-auto h-[140px]">
          <JuniorAvatar character={run.character} size={140} mood={run.lives === 1 ? "confused" : "idle"} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CharacterBadge character={run.character} avatar={false} />
            <LifeHearts lives={run.lives} maxLives={run.maxLives} size={22} />
          </div>
          <p className="mt-3 text-lg font-black">{run.courseName} · {run.materialTitle}</p>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="shrink-0 text-muted">졸업까지</span>
            <ProgressBar value={run.progress.cleared} max={run.progress.total} className="max-w-[220px]" />
            <span className="shrink-0 font-bold tabular-nums">{run.progress.cleared} / {run.progress.total} Chapter</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {inFinalStage(run) ? finalStageText(run) : run.next ? <>다음 수업 <span className="font-semibold text-ink">{run.next.title}</span></> : "다음 수업이 없습니다"}
          </p>
        </div>
        <div className="flex sm:flex-col sm:items-stretch">
          {ended ? (
            <Link href={`/materials/${run.materialId}/junior`} className="w-full"><Button className="w-full">새 후배 만나기</Button></Link>
          ) : inFinalStage(run) ? (
            <FinalExamAction run={run} className="w-full" />
          ) : (
            <Link href={href} className="w-full"><Button className="w-full">계속 가르치기 →</Button></Link>
          )}
        </div>
      </div>
    </Card>
  );
}
