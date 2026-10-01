/**
 * 챕터별 "가르치기 팩": 학습 목표·개념 사전·되묻기 규칙·반응·다음 질문·시험 문항(채점 요소 포함).
 * 경제학 1장은 정본 팩, 그 외 챕터는 points 로부터 일반 팩을 만든다.
 */
import type { ObjectiveDto } from "@/contracts/types";

export type PackElement = {
  label: string;
  concepts: string[];
  points: number;
  /** 정본 답안 문장. null 이면 사용자 설명에서 해당 개념이 나온 문장을 그대로 쓴다. */
  sentence: string | null;
  excerpt: string;
  tutor: string;
};
export type PackQuestion = {
  qid: string;
  order: number;
  points: number;
  objectiveRef: string;
  question: string;
  rubric: string;
  elements: PackElement[];
};
export type Pack = {
  objectives: ObjectiveDto[];
  concepts: Array<{ name: string; objective: string; re: RegExp }>;
  doubts: Array<{ re: RegExp; text: string }>;
  reactions: Record<string, string>;
  nextQuestions: Record<"EASY" | "HARD", Record<"o1" | "o2" | "o3" | "all", string>>;
  questions: PackQuestion[];
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");

function firstSentenceWith(text: string, needle: string): string | null {
  const sentences = text.split(/(?<=[.!?。])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 8 && !s.startsWith("#"));
  const core = needle.replace(/[·\s]/g, "").slice(0, 4);
  return sentences.find((s) => s.replace(/\s/g, "").includes(core)) ?? null;
}

/** 일반 팩: points(최대 3개)를 개념·학습목표·문항으로 1:1 매핑 */
export function genericPack(chapter: { title: string; points: string[] }, chapterText: string): Pack {
  const pts = [...chapter.points];
  while (pts.length < 3) pts.push(pts.length === 0 ? chapter.title : `${chapter.title} 정리`);
  const three = pts.slice(0, 3);
  const ids = ["o1", "o2", "o3"] as const;
  const firstSentence =
    chapterText
      .split(/\n+/)
      .map((s) => s.trim())
      .find((s) => s.length > 15 && !s.startsWith("#")) ?? chapter.title;
  const objectives = three.map((p, i) => ({ id: ids[i], text: `'${p}'의 개념을 설명할 수 있다` }));
  const concepts = three.map((p, i) => ({ name: p, objective: ids[i], re: new RegExp(escapeRe(p.replace(/\(.*?\)/g, "").trim())) }));
  const weights = [34, 33, 33];
  return {
    objectives,
    concepts,
    doubts: [],
    reactions: Object.fromEntries(three.map((p) => [p, `'${p}'는 그런 거구나.`])),
    nextQuestions: {
      EASY: {
        o1: `선배, '${three[0]}'부터 알려줄래?`,
        o2: `그럼 '${three[1]}'는 뭐야? 궁금해.`,
        o3: `마지막으로 '${three[2]}'도 알려줄래?`,
        all: "응응, 더 말해 줘! 궁금한 거 생기면 물어볼게.",
      },
      HARD: {
        o1: `'${three[0]}'부터 말해 줘. 받아쓸게.`,
        o2: `'${three[1]}', 말해 줘. 받아쓸게.`,
        o3: `'${three[2]}'도 말해 줘.`,
        all: "더 말해 줘. 받아쓸게.",
      },
    },
    questions: three.map((p, i) => {
      const excerpt = firstSentenceWith(chapterText, p) ?? firstSentence;
      return {
        qid: `q${i + 1}`,
        order: i + 1,
        points: weights[i],
        objectiveRef: ids[i],
        question: `'${p}'이 무엇인지 자료의 내용을 바탕으로 설명하시오.`,
        rubric: `${p}의 정의; ${p}의 특징`,
        elements: [
          {
            label: p,
            concepts: [p],
            points: weights[i],
            sentence: null,
            excerpt,
            tutor: `'${p}'를 자료 기준으로 다시 짚어 볼게요. 자료에는 이렇게 적혀 있어요: "${excerpt}" 처음 배우는 친구에게 한 문장으로 소개한다고 생각하고 핵심 단어만 뽑아 보세요. 그 단어들이 시험 답안의 뼈대가 됩니다. 이것만 기억하면 됩니다: ${p}의 정의를 자료 문장 그대로 한 번 말해 보기.`,
          },
        ],
      };
    }),
  };
}
