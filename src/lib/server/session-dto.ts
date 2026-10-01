import { decodeGapConcepts } from "@/lib/learning/error-reason";
import { parseTeachingChoices } from "@/lib/llm/teaching-choices";
import { formatExamChoice, formatExamQuestion } from "@/lib/shared/exam-format";
import { plainExamAnswer } from "@/lib/shared/exam-answer-text";
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import { isUnlearnedAnswer, UNLEARNED_ANSWER } from "@/lib/llm/text";
/**
 * [C 소유] 세션/결과 DTO 변환. D 의 스트리밍 라우트도 import 해서 같은 모양으로 응답한다.
 *
 *   const s = await db.session.findFirst({ where: { id, userId }, include: sessionInclude });
 *   toSessionDto(s)   // §5-5-1
 *   toResultDto(s)    // §5-5-2
 */
import type {
  ExamDto,
  FinalVerdict,
  GapDto,
  GradeVerdict,
  JuniorLevel,
  MessageDto,
  ResultDto,
  ResultItemDto,
  SessionDto,
  SessionListItemDto,
  SessionPhase,
  SessionStatus,
} from "@/contracts/types";
import { finalVerdictFor, stageLabelFor } from "@/contracts/types";
import { Prisma } from "@/lib/server/db";
import { parseObjectives, parseSentences, parseStringArray } from "@/lib/server/json-fields";

/** [게임 확장] ExamQuestion.choicesJson → choices (객관식만; 없으면 필드 생략) */
export function parseChoices(raw: string | null | undefined): string[] | undefined {
  if (!raw) return undefined;
  const arr = parseStringArray(raw);
  return arr.length ? arr : undefined;
}

export const sessionInclude = {
  chapter: { include: { material: { select: { id: true, title: true, courseName: true } } } },
  messages: { orderBy: { createdAt: "asc" } },
  exam: {
    include: {
      questions: { orderBy: { order: "asc" } },
      answers: { orderBy: { createdAt: "asc" } },
      grades: true,
    },
  },
  gaps: { orderBy: { createdAt: "asc" }, include: { tutorMessages: { orderBy: { createdAt: "asc" } } } },
} satisfies Prisma.SessionInclude;

export type SessionWithRelations = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;

export const sessionListInclude = {
  chapter: { select: { title: true, material: { select: { title: true, courseName: true } } } },
} satisfies Prisma.SessionInclude;
export type SessionForList = Prisma.SessionGetPayload<{ include: typeof sessionListInclude }>;

function displayAnswer(answer: string, objective: boolean): string {
  if (objective) return formatExamChoice(answer);
  return isUnlearnedAnswer(answer) ? UNLEARNED_ANSWER : plainExamAnswer(answer);
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** [게임 확장] 졸업시험(FINAL) 세션은 챕터 대신 "<자료> 졸업시험" 으로 보인다 */
export const FINAL_SUFFIX = " 졸업시험";
const titleOf = (s: { kind?: string | null; chapter: { title: string; material: { title: string } } }) =>
  s.kind === "FINAL" ? `${s.chapter.material.title}${FINAL_SUFFIX}` : s.chapter.title;

export function toMessageDto(m: SessionWithRelations["messages"][number]): MessageDto {
  return {
    messageId: m.id,
    role: m.role as MessageDto["role"],
    stage: m.stage as MessageDto["stage"],
    content: m.role === "JUNIOR" ? stripMarkdownBold(m.content) : m.content,
    ...(parseTeachingChoices(m.teachingChoicesJson) ? { teachingChoices: parseTeachingChoices(m.teachingChoicesJson) } : {}),
    createdAt: m.createdAt.toISOString(),
  };
}

/** rubric 은 절대 내려주지 않는다 */
export function toExamDto(exam: SessionWithRelations["exam"]): ExamDto | null {
  if (!exam) return null;
  return {
    examId: exam.id,
    status: exam.status as ExamDto["status"],
    questions: exam.questions.map((q) => ({
      qid: q.qid,
      order: q.order,
      points: q.points,
      question: formatExamQuestion(q.question),
      objectiveRef: q.objectiveRef,
      ...(parseChoices(q.choicesJson) ? { choices: parseChoices(q.choicesJson)!.map((choice) => stripMarkdownBold(choice)) } : {}),
    })),
    answers: exam.answers.map((a) => ({ qid: a.qid, answer: displayAnswer(a.answer,
      Boolean(parseChoices(exam.questions.find((q) => q.qid === a.qid)?.choicesJson)?.length)) })),
  };
}

export function toGapDto(g: SessionWithRelations["gaps"][number]): GapDto {
  const decoded = decodeGapConcepts(g.conceptsJson);
  return {
    gapId: g.id,
    qid: g.qid,
    title: stripMarkdownBold(g.title),
    diagnosis: stripMarkdownBold(g.diagnosis),
    evidenceQuote: g.evidenceQuote,
    ...decoded,
    concepts: decoded.concepts.map((concept) => stripMarkdownBold(concept)),
    sourceExcerpt: g.sourceExcerpt,
    status: g.status as GapDto["status"],
    tutorMessages: g.tutorMessages.map((t) => ({
      id: t.id,
      request: t.request,
      response: stripMarkdownBold(t.response),
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/** §5-5-1 세션 객체 */
export function toSessionDto(s: SessionWithRelations): SessionDto {
  return {
    sessionId: s.id,
    character: s.character as SessionDto["character"],
    status: s.status as SessionStatus,
    phase: s.phase as SessionPhase,
    juniorLevel: s.juniorLevel as JuniorLevel,
    chapter: {
      chapterId: s.chapter.id,
      order: s.chapter.order,
      title: titleOf(s),
      points: parseStringArray(s.chapter.pointsJson),
    },
    material: {
      materialId: s.chapter.material.id,
      title: s.chapter.material.title,
      courseName: s.chapter.material.courseName,
    },
    objectives: parseObjectives(s.objectivesJson),
    messages: s.messages.map(toMessageDto),
    heardConcepts: parseStringArray(s.heardJson),
    exam: toExamDto(s.exam),
    score: s.score ?? null,
    finalVerdict: (s.finalVerdict as FinalVerdict | null) ?? null,
    gapCount: s.gaps.length,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** §5-5 GET /sessions 목록 행 */
export function toSessionListItem(s: SessionForList): SessionListItemDto {
  const status = s.status as SessionStatus;
  return {
    sessionId: s.id,
    chapterTitle: titleOf(s),
    materialTitle: s.chapter.material.title,
    courseName: s.chapter.material.courseName,
    status,
    stageLabel: stageLabelFor(status),
    score: s.score ?? null,
    finalVerdict: (s.finalVerdict as FinalVerdict | null) ?? null,
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** §5-5-2 결과 객체. 채점이 없는 문항은 0점 WRONG 으로 채운다(방어). */
export function toResultDto(s: SessionWithRelations): ResultDto {
  const exam = s.exam;
  const questions = exam?.questions ?? [];
  const answers = new Map((exam?.answers ?? []).map((a) => [a.qid, a]));
  const grades = new Map((exam?.grades ?? []).map((g) => [g.qid, g]));

  const items: ResultItemDto[] = questions.map((q) => {
    const a = answers.get(q.qid);
    const g = grades.get(q.qid);
    return {
      qid: q.qid,
      order: q.order,
      points: q.points,
      question: formatExamQuestion(q.question),
      answer: displayAnswer(a?.answer ?? "", Boolean(parseChoices(q.choicesJson)?.length)),
      sentences: parseSentences(a?.sentencesJson),
      grade: g
        ? { score: g.score, maxScore: g.maxScore, verdict: g.verdict as GradeVerdict, comment: stripMarkdownBold(g.comment) }
        : { score: 0, maxScore: q.points, verdict: "WRONG", comment: "채점 결과가 없습니다." },
      ...(parseChoices(q.choicesJson) ? { choices: parseChoices(q.choicesJson)!.map((choice) => stripMarkdownBold(choice)) } : {}),
    };
  });

  const count = (v: GradeVerdict) => items.filter((i) => i.grade.verdict === v).length;
  const summed = items.reduce((acc, i) => acc + i.grade.score, 0);
  const totalScore = s.score ?? summed;
  const gaps = s.gaps.map(toGapDto);
  const finalVerdict = (s.finalVerdict as FinalVerdict | null) ?? finalVerdictFor(totalScore, gaps.length);

  return {
    sessionId: s.id,
    status: s.status as SessionStatus,
    totalScore,
    questionCount: items.length,
    correctCount: count("CORRECT"),
    partialCount: count("PARTIAL"),
    wrongCount: count("WRONG"),
    finalVerdict,
    items,
    gaps,
    chapter: {
      chapterId: s.chapter.id,
      title: titleOf(s),
      taughtAt: iso(s.chapter.taughtAt),
      stableAt: iso(s.chapter.stableAt),
    },
  };
}

/** 진행 중(= 완료/실패 아님) 판정 */
export const OPEN_STATUSES: SessionStatus[] = [
  "PREPARING",
  "EXPLAINING",
  "EXAM_IN_PROGRESS",
  "EVALUATING",
  "RESULT_READY",
  "REVIEWING",
];
export const isOpenStatus = (status: string) => OPEN_STATUSES.includes(status as SessionStatus);
