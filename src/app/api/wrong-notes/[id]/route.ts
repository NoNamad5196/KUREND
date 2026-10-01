// [① 게임 코어 P1] GET /api/wrong-notes/{id} → WrongNoteDto
import { requireUser } from "@/lib/server/auth";
import { json, notFound, withApi } from "@/lib/server/http";
import { loadOwnedWrongNote, toWrongNoteDto } from "@/lib/server/wrong-note";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const note = await loadOwnedWrongNote(user.userId, params.id);
  if (!note) throw notFound("오답노트를 찾을 수 없습니다.");
  return json(toWrongNoteDto(note));
});
