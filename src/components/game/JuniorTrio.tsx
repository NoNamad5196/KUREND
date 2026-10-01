import type { CSSProperties } from "react";
import { getCharacterImage } from "@/lib/characters/assets";
import { JuniorAvatar } from "./JuniorAvatar";
import "./junior-trio.css";

/** Equal silhouette centers, using the same padded alpha bounds as the PNG renderer. */
export function JuniorTrio({ graduation = false, className = "" }: { graduation?: boolean; className?: string }) {
  const skin = graduation ? "graduation" : "default";
  const male = getCharacterImage("male", skin).bounds;
  const female = getCharacterImage("female", skin).bounds;
  const style = {
    "--trio-male-half": Math.min(.8, male[2] / male[3]) / 2,
    "--trio-female-half": Math.min(.8, female[2] / female[3]) / 2,
  } as CSSProperties;
  return <div className={`junior-trio ${className}`} style={style} role="group" aria-label={graduation ? "졸업한 컴돌이, KU, 컴순이" : "함께 공부할 컴돌이, KU, 컴순이"}>
    <div className="junior-trio-slot junior-trio-male"><JuniorAvatar character="MALE_EASY" size={270} outfit={graduation ? "grad" : "default"} /></div>
    <div className="junior-trio-slot junior-trio-ku"><JuniorAvatar character="KU_HARD" size={175} outfit={graduation ? "grad" : "default"} /></div>
    <div className="junior-trio-slot junior-trio-female"><JuniorAvatar character="FEMALE_NORMAL" size={270} outfit={graduation ? "grad" : "default"} /></div>
  </div>;
}
