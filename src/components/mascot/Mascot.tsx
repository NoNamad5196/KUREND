import { StaticCharacter } from "@/components/characters/StaticCharacter";
import "./mascot.css";

export type MascotState = "idle" | "thinking" | "doubt" | "writing" | "praise" | "cheer" | "encourage";

/** Compatibility wrapper for the same static KU PNG used by JuniorAvatar. */
export function Mascot({ size = 120, typing = false, className, label = "새내기" }: {
  state?: MascotState;
  size?: number;
  typing?: boolean;
  className?: string;
  label?: string;
}) {
  return <StaticCharacter character="ku" height={Math.round(size * (270 / 240))} width={size} label={typing ? `${label}, 입력 중` : label} className={`ku-mascot ${className ?? ""}`} />;
}
