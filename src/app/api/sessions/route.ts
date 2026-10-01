// [C] POST /api/sessions {chapterId, juniorLevel?} → {sessionId} / GET /api/sessions → 목록
import type { CreateSessionResponse, SessionListItemDto } from "@/contracts/types";
import { CreateSessionRequestSchema } from "@/contracts/types";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ApiError, invalidState, json, notFound, parseJson, withApi } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { sessionListInclude, toSessionListItem } from "@/lib/server/session-dto";
import { levelFor, type JuniorCharacter } from "@/contracts/game";
import { findActiveRun } from "@/lib/server/run-access";

export const dynamic = "force-dynamic";

export const POST = withApi(async (req) => {
  const user = await requireUser(req);
  const body = await parseJson(req, CreateSessionRequestSchema);

  const chapter = await db.chapter.findFirst({
    where: { id: body.chapterId, material: { userId: user.userId } },
    select: { id: true, material: { select: { id: true, status: true } } },
  });
  if (!chapter) throw notFound("목차를 찾을 수 없습니다.");
  if (chapter.material.status !== "READY") throw invalidState("목차 생성이 끝난 자료에서만 세션을 만들 수 있습니다.");

  // [게임 확장] 이 자료에 ACTIVE Run 이 있으면 연결하고 난이도는 후배 캐릭터로 강제(body.juniorLevel 무시). 없으면 연습 모드.
  const session = await db.$transaction(async (tx) => {
    const run = await findActiveRun(user.userId, chapter.material.id, tx);
    if (body.runId && body.runId !== run?.id) {
      throw new ApiError("INVALID_STATE", "후배 정보가 바뀌었습니다. 자료 화면에서 다시 시작해 주세요.", 409, { reason: "CHAT_SESSION_INVALID", materialId: chapter.material.id });
    }
    return tx.session.create({
      data: {
        id: newId("sess"),
        userId: user.userId,
        chapterId: chapter.id,
        status: "PREPARING",
        phase: "QUESTION",
        juniorLevel: run ? levelFor(run.character as JuniorCharacter) : (body.juniorLevel ?? "EASY"),
        runId: run?.id ?? null,
        character: run?.character ?? null,
      },
      select: { id: true },
    });
  });
  const res: CreateSessionResponse = { sessionId: session.id };
  return json(res, 201);
});

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  const sessions = await db.session.findMany({
    where: { userId: user.userId, replacementSessionId: null },
    orderBy: { updatedAt: "desc" },
    include: sessionListInclude,
  });
  const body: SessionListItemDto[] = sessions.map(toSessionListItem);
  return json(body);
});
