/**
 * [③] 세션 헤더용: 현재 후배 배지 + LIFE 하트. run 이 없으면 아무것도 그리지 않는다.
 */
import type { RunDto } from "@/contracts/game";
import { CharacterBadge } from "./CharacterBadge";
import { LifeHearts } from "./LifeHearts";

export function RunHeaderBadge({ run }: { run: RunDto | null }) {
  if (!run) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <CharacterBadge character={run.character} size="sm" />
      <LifeHearts lives={run.lives} maxLives={run.maxLives} size={18} />
    </span>
  );
}
