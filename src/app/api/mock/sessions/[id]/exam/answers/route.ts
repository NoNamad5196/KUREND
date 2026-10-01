import { ExamAnswerRequestSchema } from "@/contracts/types";
import { invalidState, MockError, readJson, withMock } from "@/mocks/http";
import { composeAnswer } from "@/mocks/logic";
import { runStream, sendChars, sleep } from "@/mocks/sse";
import { allAnswered, getSession, packFor, saveAnswer, userMessages } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string }>(async (req, { params }) => {
  const s = getSession((await params).id);
  if (s.status !== "EXAM_IN_PROGRESS" || !s.exam) throw invalidState("시험을 시작한 뒤에 답안을 쓸 수 있습니다.");
  const { qid } = await readJson(req, ExamAnswerRequestSchema);
  if (!s.exam.questions.some((q) => q.qid === qid)) throw new MockError(404, "NOT_FOUND", "문항을 찾을 수 없습니다.");
  const exam = s.exam;
  return runStream(req, async (sse) => {
    const cached = exam.answers[qid];
    if (cached) {
      sse.send("answer.recap", { qid, sentences: cached });
      sse.send("answer.saved", { qid, answer: cached.map((x) => x.sentence).join(" "), cached: true });
      if (allAnswered(s)) sse.send("exam.completed", { examId: exam.examId });
      return;
    }
    const msgs = userMessages(s);
    const a = composeAnswer(packFor(s.chapterId), qid, msgs, s.heard);
    sse.send("answer.sources", { qid, sources: a.sources });
    await sleep(500);
    await sendChars(sse, a.thought, 35, (ch, last) => sse.send("answer.thought", { qid, token: ch, closed: last }));
    await sleep(400);
    for (const sent of a.sentences) {
      if (sse.closed) return;
      sse.send("answer.token", { qid, token: sent.sentence });
      sse.send("answer.recall", { qid, ref: sent.ref, level: sent.level, unlearned: sent.unlearned });
      await sleep(300 + sent.sentence.length * 30);
    }
    if (!exam.answers[qid]) saveAnswer(s, qid, a.sentences);
    sse.send("answer.saved", { qid, answer: a.answer, cached: false });
    if (allAnswered(s)) sse.send("exam.completed", { examId: exam.examId });
  });
});
