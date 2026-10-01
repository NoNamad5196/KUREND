// [① 게임 코어 P1] 오답노트 — 틀린(WRONG/PARTIAL) 문항은 채점 후 자동 저장된다.
//  GET  /api/wrong-notes?materialId=                 → {notes: WrongNoteDto[]} (최신순, 조회 시 빠진 문항 자동 백필)
//  POST /api/wrong-notes {sessionId, qid, userReason?} → WrongNoteDto (없으면 201 생성, 있으면 200. 이유가 오면 비어 있던 이유를 채움)
import { CreateWrongNoteRequestSchema, type WrongNoteListResponse } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { invalidState, json, notFound, parseJson, withApi } from "@/lib/server/http";
import { assertStatus, findOwnedSession } from "@/lib/server/session-access";
import { ensureWrongNotes, toWrongNoteDto, wrongNoteInclude, writeReason } from "@/lib/server/wrong-note";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withApi(async (req) => {
  const user = await requireUser(req);
  const body = await parseJson(req, CreateWrongNoteRequestSchema);
  const session = await findOwnedSession(user.userId, body.sessionId);
  assertStatus(session, ["RESULT_READY", "REVIEWING", "COMPLETED"], "오답노트 작성");
  if (!session.exam?.questions.some((q) => q.qid === body.qid)) throw notFound("문항을 찾을 수 없습니다.");
  const grade = session.exam?.grades.find((g) => g.qid === body.qid);
  if (!grade) throw invalidState("채점이 끝난 문항에만 오답노트를 쓸 수 있습니다.");
  if (grade.verdict === "CORRECT") throw invalidState("맞힌 문항에는 오답노트를 쓰지 않아도 됩니다.");

  const key = { sessionId_qid: { sessionId: session.id, qid: body.qid } };
  const before = await db.wrongNote.findUnique({ where: key, select: { id: true } });
  if (!before) await ensureWrongNotes(user.userId, session.id);
  const note = await db.wrongNote.findUnique({ where: key, include: wrongNoteInclude });
  if (!note) throw invalidState("오답노트를 저장하지 못했습니다. 다시 시도해 주세요.");
  // 이유가 함께 오면, 아직 비어 있을 때만 채운다(이미 쓴 이유는 PATCH 로 고친다)
  const final = body.userReason && !note.userReason ? await writeReason(note.id, body.userReason) : note;
  return json(toWrongNoteDto(final), before ? 200 : 201);
});

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  await ensureWrongNotes(user.userId);
  const materialId = new URL(req.url).searchParams.get("materialId");
  const notes = await db.wrongNote.findMany({
    where: { userId: user.userId, ...(materialId ? { session: { chapter: { materialId } } } : {}) },
    orderBy: [{ createdAt: "desc" }, { qid: "asc" }],
    include: wrongNoteInclude,
  });
  const body: WrongNoteListResponse = { notes: notes.map(toWrongNoteDto) };
  return json(body);
});
