/**
 * [③] 후배 아바타 — public/characters/{male|female|ku}/{view}.png 이미지 + 이펙트 SVG + CSS 모션.
 * props:
 *  character  MALE_EASY | FEMALE_NORMAL | KU_HARD
 *  mood       idle | happy | confused | sad | think | talk | shake | graduate   (표정/이펙트/모션)
 *  view       front | side | back            (졸업 mood 는 grad-* 컷을 자동 선택, KU 는 front 만 있음)
 *  outfit     default | grad | soldiers | casual   (컷 세트 강제 선택)
 *  pose       walk | wave | jump | still | bounce  (mood 와 별개의 몸 움직임)
 *  size       px 높이 기준(기본 160). flip: 좌우 반전. toss: 학사모 던지기. enter: 등장 애니메이션.
 */
import clsx from "clsx";
import { FX_SVG, FX_VIEWBOX } from "./junior-fx";
import type { JuniorCharacter } from "./types";
import "./junior.css";

export type JuniorMood = "idle" | "happy" | "confused" | "sad" | "think" | "talk" | "shake" | "graduate";
export type JuniorView = "front" | "side" | "back";
export type JuniorOutfit = "default" | "grad" | "soldiers" | "casual";
export type JuniorPose = "walk" | "wave" | "jump" | "still" | "bounce";

const DIR: Record<JuniorCharacter, "male" | "female" | "ku"> = { MALE_EASY: "male", FEMALE_NORMAL: "female", KU_HARD: "ku" };

/** 사용 가능한 컷 조합. 없으면 front 로 대체한다. */
export function juniorImage(character: JuniorCharacter, view: JuniorView = "front", outfit: JuniorOutfit = "default"): string {
  const dir = DIR[character];
  if (dir === "ku") return `/characters/ku/${outfit === "grad" ? "grad-front" : "front"}.png`;
  if (outfit === "soldiers" && dir !== "male") outfit = "default";
  if (outfit === "casual" && dir !== "female") outfit = "default";
  const prefix = outfit === "default" ? "" : `${outfit}-`;
  return `/characters/${dir}/${prefix}${view}.png`;
}

export function JuniorAvatar({
  character,
  mood = "idle",
  view = "front",
  outfit,
  pose,
  size = 160,
  flip = false,
  toss = false,
  enter = false,
  className,
  label,
  style,
}: {
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
  style?: React.CSSProperties;
}) {
  const resolvedOutfit: JuniorOutfit = outfit ?? (mood === "graduate" ? "grad" : "default");
  const src = juniorImage(character, view, resolvedOutfit);
  const width = Math.round(size * 0.8);
  const name = character === "KU_HARD" ? "KU" : character === "MALE_EASY" ? "남학생 후배" : "여학생 후배";
  return (
    <span
      role="img"
      aria-label={label ?? name}
      className={clsx("jr", `jr-mood-${mood}`, pose && `jr-pose-${pose}`, flip && "jr-flip", toss && "jr-toss", enter && "jr-enter", className)}
      style={{ width, height: size, ...style }}
    >
      <span className="jr-shadow" aria-hidden="true" />
      <span className="jr-figure">
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 PNG 컷, 크기가 가변이라 next/image 불필요 */}
        <img src={src} alt="" draggable={false} />
      </span>
      <svg className="jr-fx" viewBox={FX_VIEWBOX} xmlns="http://www.w3.org/2000/svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: FX_SVG }} />
    </span>
  );
}
