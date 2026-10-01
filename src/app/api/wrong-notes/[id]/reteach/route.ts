// [① 게임 코어 P1] POST /api/wrong-notes/{id}/reteach → {sessionId, focusConcepts} (201)
// 같은 챕터에 "다시 가르치기" 세션을 만든다. ACTIVE Run 이 있으면 연결(난이도는 후배 기준), focusConcepts 는 Session.focusConceptsJson 에 저장해 ② prepare 가 읽는다.
import { levelFor, type JuniorCharacter, type ReteachResponse } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, notFound, withApi } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { parseStringArray } from "@/lib/server/json-fields";
import { findActiveRun } from "@/lib/server/run-access";
import { loadOwnedWrongNote } from "@/lib/server/wrong-note";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const note = await loadOwnedWrongNote(user.userId, params.id);
  if (!note) throw notFound("오답노트를 찾을 수 없습니다.");
  const chapter = note.session.chapter;
  const run = await findActiveRun(user.userId, chapter.material.id);
  const focusConcepts = parseStringArray(note.missedConceptsJson);
  const session = await db.session.create({
    data: {
      id: newId("sess"),
      userId: user.userId,
      chapterId: chapter.id,
      status: "PREPARING",
      phase: "QUESTION",
      juniorLevel: run ? levelFor(run.character as JuniorCharacter) : "EASY",
      runId: run?.id ?? null,
      focusConceptsJson: JSON.stringify(focusConcepts),
    },
    select: { id: true },
  });
  const body: ReteachResponse = { sessionId: session.id, focusConcepts };
  return json(body, 201);
});
