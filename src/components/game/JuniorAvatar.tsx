import type { CSSProperties } from "react";
import { StaticCharacter } from "@/components/characters/StaticCharacter";
import { getCharacterImage, type CharacterId, type CharacterSkin } from "@/lib/characters/assets";
import type { JuniorCharacter } from "./types";
import "./junior.css";

// Compatibility inputs remain accepted; the character itself is always static.
export type JuniorMood = "idle" | "happy" | "confused" | "sad" | "think" | "talk" | "shake" | "graduate";
export type JuniorView = "front" | "side" | "back";
export type JuniorOutfit = "default" | "grad" | "soldiers" | "casual";
export type JuniorPose = "walk" | "wave" | "jump" | "still" | "bounce";

const CHARACTER: Record<JuniorCharacter, CharacterId> = { MALE_EASY: "male", FEMALE_NORMAL: "female", KU_HARD: "ku" };
const SKIN: Record<JuniorOutfit, CharacterSkin> = { default: "default", grad: "graduation", soldiers: "military", casual: "casual" };

/** The supplied collection has no back view; legacy back requests use its side PNG. */
export function juniorImage(character: JuniorCharacter, view: JuniorView = "front", outfit: JuniorOutfit = "default"): string {
  return getCharacterImage(CHARACTER[character], SKIN[outfit], view === "back" ? "side" : view).src;
}

export function JuniorAvatar({ character, mood = "idle", view = "front", outfit, size = 160, flip = false, className, label, style }: {
  character: JuniorCharacter;
  mood?: JuniorMood;
  view?: JuniorView;
  outfit?: JuniorOutfit;
  pose?: JuniorPose;
  size?: number;
  flip?: boolean;
  toss?: boolean;
  enter?: boolean;
  className?: string;
  label?: string;
  style?: CSSProperties;
}) {
  const resolvedOutfit = outfit ?? (mood === "graduate" ? "grad" : "default");
  const name = character === "KU_HARD" ? "KU" : character === "MALE_EASY" ? "남학생 후배" : "여학생 후배";
  return <StaticCharacter character={CHARACTER[character]} skin={SKIN[resolvedOutfit]} view={view === "back" ? "side" : view} height={size} width={Math.round(size * .8)} flip={flip} label={label ?? name} className={`jr ${className ?? ""}`} style={style} />;
}
