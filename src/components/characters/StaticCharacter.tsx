import type { CSSProperties } from "react";
import { getCharacterImage, type CharacterId, type CharacterSkin, type CharacterView } from "@/lib/characters/assets";
import "./static-character.css";

/** A single unchanged PNG: no motion, reconstructed parts, or expression FX. */
export function StaticCharacter({ character, skin = "default", view = "front", height, width, flip = false, label, className, style }: {
  character: CharacterId;
  skin?: CharacterSkin;
  view?: CharacterView;
  height: number;
  width: number;
  flip?: boolean;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const asset = getCharacterImage(character, skin, view);
  const [x, y, imageWidth, imageHeight] = asset.bounds;
  const viewportWidth = Math.min(1, height * imageWidth / imageHeight / width) * 100;
  return <span className={`static-character ${className ?? ""}`} style={{ width, height, aspectRatio: width / height, ...style }} role="img" aria-label={label} data-character={character} data-view={view} data-character-renderer="static-png">
    <span className="static-character-viewport" style={{ width: `${viewportWidth}%`, aspectRatio: imageWidth / imageHeight, ...(flip ? { transform: "scaleX(-1)" } : {}) }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- Preserve the supplied PNG and its transparent source canvas. */}
      <img src={asset.src} width={asset.width} height={asset.height} alt="" draggable={false} style={{ width: `${asset.width / imageWidth * 100}%`, left: `${-x / imageWidth * 100}%`, top: `${-y / imageHeight * 100}%` }} />
    </span>
  </span>;
}
