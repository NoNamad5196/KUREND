/**
 * 사이드바의 "지금 가르치는 후배" 카드 — 아바타·난이도·LIFE·졸업 진행. 없으면 후배 만나기 안내.
 */
import Link from "next/link";
import clsx from "clsx";
import type { RunDto } from "@/contracts/game";
import { CHARACTER_META, DIFFICULTY_TONE } from "@/components/game/characters";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { LifeHearts } from "@/components/game/LifeHearts";

export function SidebarJunior({ run, onNavigate }: { run: RunDto | null | undefined; onNavigate?: () => void }) {
  if (run === undefined) return <div className="h-[92px] animate-pulse rounded-card bg-bg" aria-hidden="true" />;
  if (!run) {
    return (
      <Link href="/new" onClick={onNavigate} className="group flex items-center gap-3 rounded-card border border-dashed border-line bg-bg/60 p-3 transition hover:border-primary hover:bg-primary-soft">
        <JuniorAvatar character="KU_HARD" size={52} mood="think" pose="still" />
        <span className="min-w-0 text-xs leading-5 text-muted"><span className="block text-sm font-bold text-ink group-hover:text-primary">후배 만나기</span>자료를 올리고 가르칠 후배를 골라 보세요</span>
      </Link>
    );
  }
  const meta = CHARACTER_META[run.character];
  const pct = run.progress.total ? Math.round((run.progress.cleared / run.progress.total) * 100) : 0;
  return (
    <Link href={`/materials/${run.materialId}`} onClick={onNavigate} className="group block rounded-card border border-line p-3 transition hover:shadow-card" style={{ background: `linear-gradient(135deg, ${meta.soft}, #fff 70%)` }} aria-label={`지금 가르치는 후배 ${meta.name}, LIFE ${run.lives}/${run.maxLives}, 졸업까지 ${run.progress.cleared}/${run.progress.total}`}>
      <div className="flex items-center gap-3">
        <JuniorAvatar character={run.character} size={56} mood={run.lives <= 1 ? "confused" : "idle"} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-black">{meta.name}<span className={clsx("rounded-full border px-1.5 text-[10px] font-black tracking-wide", DIFFICULTY_TONE[meta.difficulty].chip)}>{meta.difficulty}</span></p>
          <LifeHearts lives={run.lives} maxLives={run.maxLives} size={15} className="mt-1" />
          <p className="mt-1 truncate text-[11px] text-muted">{run.materialTitle}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold text-muted">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} /></span>
        <span className="tabular-nums">졸업 {run.progress.cleared}/{run.progress.total}</span>
      </div>
    </Link>
  );
}
