/**
 * [③] 현재 후배 배지 — `KU · HARD` (작은 아바타 + 이름 + 난이도). 헤더·카드·오버레이 공용.
 */
import clsx from "clsx";
import { CHARACTER_META, DIFFICULTY_TONE } from "./characters";
import { JuniorAvatar } from "./JuniorAvatar";
import type { JuniorCharacter } from "./types";

export function CharacterBadge({
  character,
  size = "md",
  avatar = true,
  className,
}: {
  character: JuniorCharacter;
  size?: "sm" | "md";
  avatar?: boolean;
  className?: string;
}) {
  const meta = CHARACTER_META[character];
  const tone = DIFFICULTY_TONE[meta.difficulty];
  return (
    <span className={clsx("inline-flex items-center gap-2 rounded-full border border-line bg-surface pr-3", size === "sm" ? "py-0.5 pl-1 text-xs" : "py-1 pl-1.5 text-sm", className)}>
      {avatar && <JuniorAvatar character={character} size={size === "sm" ? 22 : 30} pose="still" />}
      <span className="font-bold">{meta.name}</span>
      <span className={clsx("rounded-full border px-1.5 font-black tracking-wide", size === "sm" ? "text-[10px]" : "text-[11px]", tone.chip)}>{meta.difficulty}</span>
    </span>
  );
}
