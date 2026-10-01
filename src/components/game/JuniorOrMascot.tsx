/**
 * [③] 세션·시험 화면의 후배 그림. Run 이 있으면 고른 후배(남학생/여학생/KU 사진 아바타), 없으면(연습 모드) 기존 KU 마스코트.
 * Mascot 의 상태 이름을 그대로 받아 JuniorAvatar 의 mood/pose 로 옮긴다.
 */
import type { JuniorCharacter } from "@/contracts/game";
import { Mascot, type MascotState } from "@/components/mascot/Mascot";
import { JuniorAvatar, type JuniorMood, type JuniorPose } from "./JuniorAvatar";

const MOOD: Record<MascotState, { mood: JuniorMood; pose?: JuniorPose }> = {
  idle: { mood: "idle" },
  thinking: { mood: "think" },
  doubt: { mood: "confused" },
  writing: { mood: "think" },
  praise: { mood: "happy" },
  cheer: { mood: "happy", pose: "jump" },
  encourage: { mood: "talk" },
};

export function JuniorOrMascot({ character, state = "idle", size = 120, typing, className }: { character?: JuniorCharacter | null; state?: MascotState; size?: number; typing?: boolean; className?: string }) {
  if (!character) return <Mascot state={state} size={size} typing={typing} className={className} />;
  const { mood, pose } = MOOD[state];
  return <JuniorAvatar character={character} mood={mood} pose={pose} size={Math.round(size * 1.15)} className={className} />;
}

/** 화면 문구의 주어: Run 이 있으면 캐릭터 이름(남학생/여학생/KU), 없으면 "새내기" */
export function juniorLabel(character?: JuniorCharacter | null): string {
  return character === "MALE_EASY" ? "남학생" : character === "FEMALE_NORMAL" ? "여학생" : character === "KU_HARD" ? "KU" : "새내기";
}

/** 한국어 조사: 받침 유무로 이/가, 은/는, 을/를, 의(그대로) 를 고른다. KU 처럼 영문은 발음(케이유)으로 받침 없음 처리. */
export function withJosa(word: string, pair: "이/가" | "은/는" | "을/를"): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : false;
  const [withB, withoutB] = pair.split("/");
  return `${word}${hasBatchim ? withB : withoutB}`;
}
