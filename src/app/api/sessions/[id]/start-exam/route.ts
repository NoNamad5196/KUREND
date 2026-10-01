// [C] POST /api/sessions/{id}/start-exam → {status:"EXAM_IN_PROGRESS", exam:{examId, questions[]}}
//     EXPLAINING / phase EXAM_READY / Exam READY 에서만. rubric 은 내려주지 않는다.
import type { StartExamResponse } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { invalidState, json, withApi } from "@/lib/server/http";
import { assertStatus, loadOwnedSession } from "@/lib/server/session-access";
import { parseChoices } from "@/lib/server/session-dto";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  assertStatus(session, ["EXPLAINING"], "시험 시작");
  if (session.phase !== "EXAM_READY") throw invalidState("먼저 설명을 마쳐야 시험을 시작할 수 있습니다. (finish-explanation)");
  const exam = session.exam;
  if (!exam || exam.questions.length === 0) throw invalidState("시험 문항이 아직 준비되지 않았습니다.");
  if (exam.status !== "READY") throw invalidState(`시험이 이미 ${exam.status} 상태입니다.`);

  await db.$transaction([
    db.session.update({ where: { id: session.id }, data: { status: "EXAM_IN_PROGRESS" } }),
    db.exam.update({ where: { id: exam.id }, data: { status: "IN_PROGRESS" } }),
  ]);

  const body: StartExamResponse = {
    status: "EXAM_IN_PROGRESS",
    exam: {
      examId: exam.id,
      questions: exam.questions.map((q) => ({
        qid: q.qid,
        order: q.order,
        points: q.points,
        question: q.question,
        objectiveRef: q.objectiveRef,
        // [게임 확장] 객관식 보기 — 빠지면 시험 시작 직후 화면에서 보기가 사라진다
        ...(parseChoices(q.choicesJson) ? { choices: parseChoices(q.choicesJson) } : {}),
      })),
    },
  };
  return json(body);
});
