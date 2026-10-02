import assert from "node:assert/strict";
import { test } from "node:test";
import { toExamDto, toGapDto, toMessageDto, toResultDto, type SessionWithRelations } from "../session-dto";
import { encodeGapConcepts } from "@/lib/learning/error-reason";

test("saved exams display formal questions and plain answers without rewriting stored records", () => {
  const exam = {
    id: "exam_saved", status: "DONE",
    questions: [
      { qid: "q1", order: 1, points: 50, question: "선배님, **준비 상태**는 무엇인가요?", objectiveRef: "o1", choicesJson: null },
      { qid: "q2", order: 2, points: 50, question: "다음 중 준비 상태를 고르시오.", objectiveRef: "o2", choicesJson: '["① 실행", "② 준비", "③ 대기", "④ 종료"]' },
    ],
    answers: [
      { qid: "q1", answer: "“준비 상태는 CPU를 기다리는 상태이다.”라고 배웠습니다." },
      { qid: "q2", answer: "② 선배님, 준비 상태입니다." },
    ],
  } as unknown as NonNullable<SessionWithRelations["exam"]>;
  const before = structuredClone(exam);
  const visible = toExamDto(exam)!;
  assert.equal(visible.questions[0].question, "준비 상태는 무엇인지 설명하시오.");
  assert.equal(visible.answers[0].answer, "준비 상태는 CPU를 기다리는 상태이다.");
  assert.equal(visible.answers[1].answer, "2번");
  assert.equal(visible.questions.length, 2, "existing exam count is never migrated by a read");
  assert.deepEqual(exam, before);
});

test("junior markup is hidden while original user explanations remain unchanged", () => {
  const message = { id: "msg_saved", role: "USER", stage: "ANSWER", content: "**준비 상태**는 CPU를 기다린다.", createdAt: new Date(), teachingChoicesJson: null };
  assert.equal(toMessageDto(message as SessionWithRelations["messages"][number]).content, message.content);
  assert.equal(toMessageDto({ ...message, role: "JUNIOR" } as SessionWithRelations["messages"][number]).content, "준비 상태는 CPU를 기다린다.");
});

test("result formatting preserves score, verdict, citation evidence and saved source text", () => {
  const evidence = "**프로세스** 원문";
  const sentences = [{ sentence: "이 부분은 선배한테 못 들어서 모르겠습니다.", ref: null, level: "NONE", unlearned: true }];
  const session = {
    id: "sess_saved", kind: "CHAPTER", status: "RESULT_READY", score: 0, finalVerdict: "NEEDS_WORK",
    chapter: { id: "chapter", title: "상태", material: { title: "운영체제" }, taughtAt: null, stableAt: null },
    exam: {
      questions: [{ qid: "q1", order: 1, points: 100, question: "선배님, **준비 상태**는 무엇인가요?", choicesJson: null }],
      answers: [{ qid: "q1", answer: sentences[0].sentence, sentencesJson: JSON.stringify(sentences) }],
      grades: [{ qid: "q1", score: 0, maxScore: 100, verdict: "WRONG", comment: "**근거가 없습니다.**" }],
    },
    gaps: [{ id: "gap", qid: "q1", title: "**상태**", diagnosis: "**설명이 누락되었습니다.**", evidenceQuote: evidence,
      sourceExcerpt: evidence, conceptsJson: encodeGapConcepts(["**프로세스**"], "INSUFFICIENT_LEARNING"), status: "OPEN", tutorMessages: [] }],
  } as unknown as SessionWithRelations;
  const before = structuredClone(session);
  const result = toResultDto(session);
  assert.equal(result.totalScore, 0);
  assert.equal(result.items[0].grade.verdict, "WRONG");
  assert.equal(result.items[0].grade.comment, "근거가 없습니다.");
  assert.equal(result.items[0].answer, "모르겠습니다.");
  assert.deepEqual(result.items[0].sentences, sentences);
  assert.equal(result.gaps[0].evidenceQuote, evidence);
  assert.equal(result.gaps[0].sourceExcerpt, evidence);
  assert.deepEqual(result.gaps[0].concepts, ["프로세스"]);
  assert.equal(result.gaps[0].errorReason, "INSUFFICIENT_LEARNING");
  assert.deepEqual(session, before);
});

test("legacy gap concepts stay readable and invalid reason metadata never invents a diagnosis", () => {
  for (const conceptsJson of ['["**준비 상태**"]', '["**준비 상태**", {"learningErrorReason":"unsupported"}]']) {
    const stored = {
      id: "gap_saved", qid: "q1", title: "상태", diagnosis: "설명 확인", evidenceQuote: "**원문**",
      sourceExcerpt: "`ready` 원문", conceptsJson, status: "FOUND", tutorMessages: [],
    } as unknown as SessionWithRelations["gaps"][number];
    const before = structuredClone(stored);
    const gap = toGapDto(stored);
    assert.deepEqual(gap.concepts, ["준비 상태"]);
    assert.equal(gap.errorReason, undefined);
    assert.equal(gap.evidenceQuote, stored.evidenceQuote);
    assert.equal(gap.sourceExcerpt, stored.sourceExcerpt);
    assert.deepEqual(stored, before);
  }
});
