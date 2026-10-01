// [① 게임 코어 P1] 오답노트
//  POST /api/wrong-notes {sessionId, qid, userReason} → WrongNoteDto (201, 같은 문항 재요청은 기존 노트 200)
//  GET  /api/wrong-notes?materialId=                → {notes: WrongNoteDto[]} (최신순)
import { CreateWrongNoteRequestSchema, type WrongNoteListResponse } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { invalidState, json, notFound, parseJson, withApi } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { parseStringArray } from "@/lib/server/json-fields";
import { assertStatus, findOwnedSession } from "@/lib/server/session-access";
import { aiComparisonFor, toWrongNoteDto, wrongNoteInclude } from "@/lib/server/wrong-note";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withApi(async (req) => {
  const user = await requireUser(req);
  const body = await parseJson(req, CreateWrongNoteRequestSchema);
  const session = await findOwnedSession(user.userId, body.sessionId);
  assertStatus(session, ["RESULT_READY", "REVIEWING", "COMPLETED"], "오답노트 작성");

  const existing = await db.wrongNote.findUnique({ where: { sessionId_qid: { sessionId: session.id, qid: body.qid } }, include: wrongNoteInclude });
  if (existing) return json(toWrongNoteDto(existing));

  const question = session.exam?.questions.find((q) => q.qid === body.qid);
  if (!question) throw notFound("문항을 찾을 수 없습니다.");
  const grade = session.exam?.grades.find((g) => g.qid === body.qid);
  if (!grade) throw invalidState("채점이 끝난 문항에만 오답노트를 쓸 수 있습니다.");
  if (grade.verdict === "CORRECT") throw invalidState("맞힌 문항에는 오답노트를 쓰지 않아도 됩니다.");

  const gapRow = session.gaps.find((g) => g.qid === body.qid) ?? null;
  const gap = gapRow
    ? { title: gapRow.title, diagnosis: gapRow.diagnosis, sourceExcerpt: gapRow.sourceExcerpt, concepts: parseStringArray(gapRow.conceptsJson) }
    : null;
  const answer = session.exam?.answers.find((a) => a.qid === body.qid)?.answer ?? "";
  const taught = session.messages.filter((m) => m.role === "USER" && !m.excluded).map((m, i) => ({ ref: i + 1, content: m.content }));
  const { comparison, missedConcepts } = await aiComparisonFor({
    question: question.question,
    answer,
    grade: { score: grade.score, maxScore: grade.maxScore, verdict: grade.verdict, comment: grade.comment },
    gap,
    userReason: body.userReason,
    taught,
  });
  const aiDiagnosis = gap ? `${gap.title}. ${gap.diagnosis}` : grade.comment;

  try {
    const note = await db.wrongNote.create({
      data: {
        id: newId("wn"),
        userId: user.userId,
        runId: session.runId,
        sessionId: session.id,
        qid: body.qid,
        userReason: body.userReason,
        aiDiagnosis,
        aiComparison: comparison,
        missedConceptsJson: JSON.stringify(missedConcepts),
      },
      include: wrongNoteInclude,
    });
    return json(toWrongNoteDto(note), 201);
  } catch {
    // 동시 요청이 먼저 저장한 경우
    const saved = await db.wrongNote.findUnique({ where: { sessionId_qid: { sessionId: session.id, qid: body.qid } }, include: wrongNoteInclude });
    if (saved) return json(toWrongNoteDto(saved));
    throw invalidState("오답노트를 저장하지 못했습니다. 다시 시도해 주세요.");
  }
});

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  const materialId = new URL(req.url).searchParams.get("materialId");
  const notes = await db.wrongNote.findMany({
    where: { userId: user.userId, ...(materialId ? { session: { chapter: { materialId } } } : {}) },
    orderBy: { createdAt: "desc" },
    include: wrongNoteInclude,
  });
  const body: WrongNoteListResponse = { notes: notes.map(toWrongNoteDto) };
  return json(body);
});
