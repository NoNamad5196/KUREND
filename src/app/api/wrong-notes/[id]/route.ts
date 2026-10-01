// [① 게임 코어 P1] GET /api/wrong-notes/{id} → WrongNoteDto / PATCH {userReason} → 이유 저장 + AI 비교 생성
import { UpdateWrongNoteRequestSchema } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { json, notFound, parseJson, withApi } from "@/lib/server/http";
import { loadOwnedWrongNote, toWrongNoteDto, writeReason } from "@/lib/server/wrong-note";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const note = await loadOwnedWrongNote(user.userId, params.id);
  if (!note) throw notFound("오답노트를 찾을 수 없습니다.");
  return json(toWrongNoteDto(note));
});

export const PATCH = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const { userReason } = await parseJson(req, UpdateWrongNoteRequestSchema);
  const note = await loadOwnedWrongNote(user.userId, params.id);
  if (!note) throw notFound("오답노트를 찾을 수 없습니다.");
  return json(toWrongNoteDto(await writeReason(note.id, userReason)));
});
