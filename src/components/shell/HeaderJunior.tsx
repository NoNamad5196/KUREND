/**
 * 상단 내비게이션의 "지금 가르치는 후배" 칩 — 아바타·LIFE·졸업 진행을 어느 화면에서나 보이게 한다.
 * 진행 중인 Run 이 없거나 아직 불러오는 중이면 아무것도 그리지 않는다(홈의 후배 카드가 안내를 맡는다).
 */
import Link from "next/link";
import type { RunDto } from "@/contracts/game";
import { CHARACTER_META } from "@/components/game/characters";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { LifeHearts } from "@/components/game/LifeHearts";

export function HeaderJunior({ run, onNavigate }: { run: RunDto | null | undefined; onNavigate?: () => void }) {
  if (!run || run.status !== "ACTIVE") return null;
  const meta = CHARACTER_META[run.character];
  const low = run.lives <= 1;
  return (
    <Link
      href={`/materials/${encodeURIComponent(run.materialId)}`}
      onClick={onNavigate}
      className="site-junior"
      data-low={low ? "1" : undefined}
      aria-label={`지금 가르치는 후배 ${meta.name}, LIFE ${run.lives}/${run.maxLives}, 졸업까지 ${run.progress.cleared}/${run.progress.total} 챕터`}
    >
      <span className="site-junior-avatar" aria-hidden="true"><JuniorAvatar character={run.character} size={34} pose="still" mood={low ? "confused" : "idle"} /></span>
      <span className="site-junior-text" aria-hidden="true">
        <span className="site-junior-name">{meta.name}</span>
        <span className="site-junior-progress">졸업 {run.progress.cleared}/{run.progress.total}</span>
      </span>
      <LifeHearts lives={run.lives} maxLives={run.maxLives} size={12} />
    </Link>
  );
}
