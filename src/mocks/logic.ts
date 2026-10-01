/**
 * [B] mock 순수 로직: 되묻기 감지, 개념 추출, 반응/다음 질문, 답안 작성, 채점, 튜터 응답.
 * docs/b-split.md §2 정본 규칙. (실제 LLM 은 D 가 lib/llm 에서 구현)
 */
import type { AnswerSentenceDto, GradeVerdict, JuniorLevel, RecallLevel } from "@/contracts/types";
import type { Pack, PackElement, PackQuestion } from "./pack";

export type UserMsg = { ref: number; content: string };

export function detectDoubt(pack: Pack, content: string, level: JuniorLevel): string | null {
  if (level !== "EASY") return null;
  return pack.doubts.find((d) => d.re.test(content))?.text ?? null;
}

export function extractConcepts(pack: Pack, content: string): string[] {
  return pack.concepts.filter((c) => c.re.test(content)).map((c) => c.name);
}

export function coveredObjectives(pack: Pack, heard: string[]): string[] {
  const set = new Set(pack.concepts.filter((c) => heard.includes(c.name)).map((c) => c.objective));
  return pack.objectives.map((o) => o.id).filter((id) => set.has(id));
}

export function buildReactions(pack: Pack, added: string[], level: JuniorLevel): string[] {
  const base = added.length ? added.slice(0, 3).map((c) => pack.reactions[c] ?? `'${c}'는 그런 거구나.`) : ["음… 그 부분은 좀 헷갈리네.", "다시 한 번 들어볼게."];
  if (level === "HARD") return [`${base[0].replace(/[.!?…]+$/, "")}라고. 받아썼어.`];
  return base;
}

export function nextQuestion(pack: Pack, covered: string[], level: JuniorLevel): string {
  const missing = pack.objectives.map((o) => o.id).find((id) => !covered.includes(id)) as "o1" | "o2" | "o3" | undefined;
  return pack.nextQuestions[level][missing ?? "all"];
}

export function firstQuestion(pack: Pack, level: JuniorLevel): string {
  return pack.nextQuestions[level].o1;
}

/** 개념이 처음 등장한 USER 메시지 */
function firstRefFor(pack: Pack, concepts: string[], msgs: UserMsg[]): UserMsg | null {
  for (const m of msgs) {
    const found = extractConcepts(pack, m.content);
    if (concepts.some((c) => found.includes(c))) return m;
  }
  return null;
}

function sentenceFromUser(m: UserMsg, pack: Pack, concepts: string[]): string {
  const sentences = m.content.split(/(?<=[.!?。])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const hit = sentences.find((s) => concepts.some((c) => pack.concepts.find((x) => x.name === c)?.re.test(s))) ?? sentences[0] ?? m.content;
  const clean = hit.replace(/[.!?。]+$/, "");
  return `선배 말로는 ${clean}라고 합니다.`;
}

export type ComposedAnswer = {
  thought: string;
  sentences: AnswerSentenceDto[];
  sources: Array<{ ref: number; content: string }>;
  unlearned: boolean;
  answer: string;
};

export const UNLEARNED_SENTENCE = "이 부분은 선배한테 못 들어서 모르겠습니다.";

export function composeAnswer(pack: Pack, qid: string, msgs: UserMsg[], heard: string[]): ComposedAnswer {
  const q = pack.questions.find((x) => x.qid === qid);
  if (!q) throw new Error(`unknown qid ${qid}`);
  const sentences: AnswerSentenceDto[] = [];
  for (const el of q.elements) {
    if (!el.concepts.some((c) => heard.includes(c))) continue;
    const m = firstRefFor(pack, el.concepts, msgs);
    const level: RecallLevel = m ? (m.content.length >= 30 ? "STRONG" : "FAINT") : "NONE";
    const text = el.sentence ?? (m ? sentenceFromUser(m, pack, el.concepts) : `${el.label}에 대해 들었습니다.`);
    sentences.push({ sentence: text, ref: m?.ref ?? null, level, unlearned: false });
  }
  const unlearned = sentences.length === 0;
  if (unlearned) sentences.push({ sentence: UNLEARNED_SENTENCE, ref: null, level: "NONE", unlearned: true });
  const refs = new Set(sentences.map((s) => s.ref).filter((r): r is number => r !== null));
  const sources = (refs.size ? msgs.filter((m) => refs.has(m.ref)) : msgs).map((m) => ({ ref: m.ref, content: m.content }));
  return {
    thought: unlearned ? "이건… 들은 적이 없는데…" : "선배가 말해준 거 떠올려 보자…",
    sentences,
    sources,
    unlearned,
    answer: sentences.map((s) => s.sentence).join(" "),
  };
}

export type GradeResult = { qid: string; score: number; maxScore: number; verdict: GradeVerdict; comment: string };
export type GapDraft = {
  qid: string;
  title: string;
  diagnosis: string;
  evidenceQuote: string;
  concepts: string[];
  sourceExcerpt: string;
  tutorKey: string; // 빠진 첫 요소 라벨
};

function clip(s: string, n: number) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** 채점: 답안 문장이 아니라 "들은 개념"으로 요소 충족 여부를 판단(답안이 그 개념에서 나왔으므로 동일) */
export function gradeQuestion(q: PackQuestion, heard: string[], answerSentences: AnswerSentenceDto[], msgs: UserMsg[]): { grade: GradeResult; gap: GapDraft | null } {
  const met: PackElement[] = [];
  const missing: PackElement[] = [];
  for (const el of q.elements) (el.concepts.some((c) => heard.includes(c)) ? met : missing).push(el);
  const score = met.reduce((a, e) => a + e.points, 0);
  const verdict: GradeVerdict = score >= q.points ? "CORRECT" : score === 0 ? "WRONG" : "PARTIAL";
  const parts: string[] = [];
  if (met.length) parts.push(`${met.map((e) => e.label).join(", ")} 설명은 자료와 일치합니다.`);
  if (missing.length) parts.push(`${missing.map((e) => e.label).join(", ")} 내용이 빠졌습니다.`);
  const comment = clip(parts.join(" ") || "답안을 확인했습니다.", 120);
  const grade: GradeResult = { qid: q.qid, score, maxScore: q.points, verdict, comment };
  if (verdict === "CORRECT") return { grade, gap: null };

  const refs = answerSentences.map((s) => s.ref).filter((r): r is number => r !== null);
  const evidence = refs.length ? msgs.find((m) => m.ref === refs[0])?.content ?? "" : "";
  const first = missing[0];
  const diag: string[] = [];
  if (met.length) {
    diag.push(`새내기 답안에는 ${met.map((e) => e.label).join(", ")}까지만 적혀 있고 ${missing.map((e) => e.label).join(", ")} 내용이 없습니다.`);
    diag.push(`답안의 앞부분은 선배의 [설명 ${refs[0]}]에서 그대로 가져온 것입니다.`);
  } else {
    diag.push("새내기는 이 문항에 대해 아무것도 듣지 못해 '못 들어서 모르겠다'고 답했습니다.");
  }
  diag.push(`${missing.map((e) => e.label).join(", ")} 부분은 설명에서 다루지 않음으로 확인됩니다.`);
  diag.push("새내기는 들은 것만 쓸 수 있으므로, 이 부분을 한 번 더 가르치면 다음 시험에서 맞힐 수 있습니다.");
  return {
    grade,
    gap: {
      qid: q.qid,
      title: clip(`${first.label} 설명이 빠짐`, 25),
      diagnosis: diag.join(" "),
      evidenceQuote: evidence,
      concepts: missing.map((e) => e.label),
      sourceExcerpt: first.excerpt,
      tutorKey: first.label,
    },
  };
}

export function tutorResponse(pack: Pack, gap: { qid: string; concepts: string[] }, custom: boolean): string {
  const q = pack.questions.find((x) => x.qid === gap.qid);
  const el = q?.elements.find((e) => e.label === gap.concepts[0]) ?? q?.elements[0];
  const body = el?.tutor ?? "자료의 해당 부분을 다시 읽고 핵심 단어를 한 문장으로 말해 보세요. 이것만 기억하면 됩니다: 자료 문장 그대로 한 번 말해 보기.";
  return custom ? `좋은 질문이에요. ${body}` : body;
}

export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean);
}
