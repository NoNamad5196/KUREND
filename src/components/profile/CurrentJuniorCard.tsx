import clsx from "clsx";
import type { RunDto } from "@/contracts/game";
import { CHARACTER_META, DIFFICULTY_TONE } from "@/components/game/characters";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { LifeHearts } from "@/components/game/LifeHearts";
import { ProgressBar } from "@/components/achievements/ProgressBar";
import { Card } from "@/components/shell/ui";
import { ButtonLink } from "./ButtonLink";

/** 지금 함께하는 후배 (없으면 새 자료 CTA) */
export function CurrentJuniorCard({ run }: { run: RunDto | null }) {
  if (!run) {
    return (
      <Card className="flex h-full flex-col items-center justify-center text-center">
        <JuniorAvatar character="KU_HARD" mood="think" size={110} />
        <h2 className="mt-3 text-lg font-bold">아직 함께하는 후배가 없어요</h2>
        <p className="mt-1 max-w-xs text-sm text-muted">자료를 올리고 가르칠 후배를 골라 보세요.</p>
        <ButtonLink href="/new" className="mt-4">첫 자료 올리기</ButtonLink>
      </Card>
    );
  }
  const meta = CHARACTER_META[run.character];
  const { cleared, total } = run.progress;
  return (
    <Card className="flex h-full flex-col">
      <h2 className="text-lg font-bold">함께하는 후배</h2>
      <div className="mt-3 flex items-center gap-4">
        <div className="grid h-32 w-28 shrink-0 place-items-end justify-center overflow-hidden rounded-2xl pb-1" style={{ background: meta.soft }}>
          <JuniorAvatar character={run.character} mood={run.lives <= 1 ? "sad" : "idle"} size={116} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-bold">{meta.name}</p>
            <span className={clsx("rounded-full border px-2 py-0.5 text-[11px] font-bold", DIFFICULTY_TONE[meta.difficulty].chip)}>{meta.difficulty}</span>
          </div>
          <LifeHearts lives={run.lives} maxLives={run.maxLives} size={20} className="mt-2" />
          <p className="mt-2 truncate text-sm font-semibold" title={run.materialTitle}>{run.materialTitle}</p>
          <p className="text-xs text-muted">{run.courseName} · 챕터 {cleared}/{total} 통과</p>
        </div>
      </div>
      <ProgressBar value={cleared} goal={Math.max(total, 1)} label="챕터 통과 진행도" className="mt-4" />
      <ButtonLink href={`/materials/${encodeURIComponent(run.materialId)}`} className="mt-4 w-full">이어서 가르치기 →</ButtonLink>
    </Card>
  );
}
