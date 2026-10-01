/**
 * [③] 현재 후배 배지 — `KU · HARD` (작은 아바타 + 이름 + 난이도). 헤더·카드·오버레이 공용.
 */
import clsx from "clsx";
import { CHARACTER_META } from "./characters";
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
  return (
    <span className={clsx("inline-flex max-w-full items-center gap-2.5 text-ink", size === "sm" ? "py-1 text-xs" : "py-1.5 text-sm", className)}>
      {avatar && <JuniorAvatar character={character} size={size === "sm" ? 22 : 30} pose="still" />}
      <span className="whitespace-nowrap font-bold">{meta.name}</span>
      <span className={clsx("border-l border-line pl-2.5 font-mono font-medium tracking-widest text-muted", size === "sm" ? "text-[10px]" : "text-[11px]")}>{meta.difficulty}</span>
    </span>
  );
}
