/**
 * [③] 캐릭터 UI 메타 — 색·소개·능력치·이벤트 대사. 숫자 규칙(합격선 등)은 여기 두지 않고 types.ts(→ contracts/game.ts)를 쓴다.
 * 대사는 원 기획 §14~§16·§20 문구 그대로.
 */
import type { JuniorCharacter } from "./types";

export type CharacterMeta = {
  key: JuniorCharacter;
  name: string;
  difficulty: "EASY" | "NORMAL" | "HARD";
  color: string; // 대표색
  soft: string; // 배경색
  intro: string[]; // 선택 카드 설명 2줄
  teachLabel: string;
  exampleLine: string;
  teachingHint: string;
  traits: { 이해력: number; 기억력: number; 되묻기: number; 시험난이도: number }; // 1~5
  examLabel: string;
  gameOver: { title: string; lines: string[]; after: string };
  graduation: { lines: string[] };
};

export const CHARACTER_META: Record<JuniorCharacter, CharacterMeta> = {
  MALE_EASY: {
    key: "MALE_EASY",
    name: "컴돌이",
    difficulty: "EASY",
    color: "#3F6FB5",
    soft: "#E6EEF9",
    intro: ["이해가 빠른 후배", "선택형 중심 · 필요하면 직접 설명"],
    teachLabel: "선택지로 쉽게 가르치기",
    exampleLine: "이 개념은 어떤 뜻인지 궁금합니다.",
    teachingHint: "질문마다 뜨는 힌트(모범답안이나 키워드)를 참고해 설명해 주세요. 보낸 내용 그대로 후배가 배워요.",
    traits: { 이해력: 5, 기억력: 5, 되묻기: 2, 시험난이도: 2 },
    examLabel: "객관식 4지선다 5문항",
    gameOver: {
      title: "GAME OVER",
      lines: ["어라...", "컴돌이가 결국 군대로 떠나버렸네.", "잘 다녀와...", "다음에 보자~~"],
      after: "새로운 후배가 찾아왔어요.",
    },
    graduation: { lines: ["드디어 졸업이다!", "축하해~"] },
  },
  FEMALE_NORMAL: {
    key: "FEMALE_NORMAL",
    name: "컴순이",
    difficulty: "NORMAL",
    color: "#C9566E",
    soft: "#FBE7EC",
    intro: ["한 번 명확하게 들으면 기억해요", "왜 그런지, 어떤 뜻인지 궁금해해요"],
    teachLabel: "이유와 의미를 직접 설명하기",
    exampleLine: "왜 그렇게 되는 건가요?",
    teachingHint: "뜻과 이유를 함께 설명해 주세요. 개념끼리 어떻게 이어지는지도 좋아요.",
    traits: { 이해력: 4, 기억력: 5, 되묻기: 3, 시험난이도: 3 },
    examLabel: "서술형 5문항 (의미 설명)",
    gameOver: {
      title: "GAME OVER",
      lines: ["어라...", "컴순이가 어디로 갔지?", "음...", "다음에 볼 수 있겠지~"],
      after: "새로운 후배가 찾아왔어요.",
    },
    graduation: { lines: ["드디어 졸업이다!", "축하해~"] },
  },
  KU_HARD: {
    key: "KU_HARD",
    name: "KU",
    difficulty: "HARD",
    color: "#C77A12",
    soft: "#FFF1D6",
    intro: ["이해시키기 어려움", "반복 설명 필요 · 서술형 시험"],
    teachLabel: "여러 번 설명하며 이해시키기",
    exampleLine: "선배, 그 말 다시 설명해 줘.",
    teachingHint: "한 번 들었다고 모두 기억하지는 못해요. 다른 표현과 예시로 다시 설명해 주세요.",
    traits: { 이해력: 2, 기억력: 3, 되묻기: 5, 시험난이도: 5 },
    examLabel: "서술형 5문항 + 응용",
    gameOver: {
      title: "GAME OVER",
      lines: ["어...", "KU가 어디 트럭에 타버렸네.", "안녕~", "다음에 봐~~"],
      after: "새로운 후배가 찾아왔어요.",
    },
    graduation: { lines: ["드디어 졸업이다!", "축하해~"] },
  },
};

export const DIFFICULTY_TONE: Record<CharacterMeta["difficulty"], { chip: string; text: string }> = {
  EASY: { chip: "bg-[#E6EEF9] text-[#2F5A99] border-[#2F5A99]/20", text: "text-[#2F5A99]" },
  NORMAL: { chip: "bg-[#FBE7EC] text-[#A8415A] border-[#A8415A]/20", text: "text-[#A8415A]" },
  HARD: { chip: "bg-[#FFF1D6] text-[#9A5B00] border-[#9A5B00]/20", text: "text-[#9A5B00]" },
};
