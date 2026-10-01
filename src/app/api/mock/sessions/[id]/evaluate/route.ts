import type { GradeDto } from "@/contracts/types";
import { withMock } from "@/mocks/http";
import { gradeQuestion } from "@/mocks/logic";
import { runStream, sleep } from "@/mocks/sse";
import { finishEvaluating, getSession, newId, packFor, startEvaluating, toGapDto, userMessages, type GapRec } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string }>(async (req, { params }) => {
  const s = getSession((await params).id);
  startEvaluating(s);
  const pack = packFor(s.chapterId);
  const msgs = userMessages(s);
  return runStream(req, async (sse) => {
    const grades: Record<string, GradeDto> = {};
    const gaps: GapRec[] = [];
    for (const q of pack.questions) {
      sse.send("grading", { qid: q.qid });
      await sleep(600);
      const { grade, gap } = gradeQuestion(q, s.heard, s.exam!.answers[q.qid] ?? [], msgs);
      grades[q.qid] = { score: grade.score, maxScore: grade.maxScore, verdict: grade.verdict, comment: grade.comment };
      sse.send("grade", grade);
      if (gap) {
        const { tutorKey: _tk, ...rest } = gap;
        void _tk;
        gaps.push({ gapId: newId("gap"), ...rest, status: "FOUND", createdAt: new Date().toISOString(), tutorMessages: [] });
      }
      await sleep(250);
    }
    for (const g of gaps) {
      sse.send("gap", toGapDto(g));
      await sleep(300);
    }
    finishEvaluating(s, grades, gaps);
    sse.send("result", { totalScore: s.score, finalVerdict: s.finalVerdict, gapCount: gaps.length });
  });
});
