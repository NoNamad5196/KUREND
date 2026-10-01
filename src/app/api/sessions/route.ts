// [C] POST /api/sessions {chapterId, juniorLevel?} → {sessionId} / GET /api/sessions → 목록
import type { CreateSessionResponse, SessionListItemDto } from "@/contracts/types";
import { CreateSessionRequestSchema } from "@/contracts/types";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { invalidState, json, notFound, parseJson, withApi } from "@/lib/server/http";
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
  const run = await findActiveRun(user.userId, chapter.material.id);
  const session = await db.session.create({
    data: {
      id: newId("sess"),
      userId: user.userId,
      chapterId: chapter.id,
      status: "PREPARING",
      phase: "QUESTION",
      juniorLevel: run ? levelFor(run.character as JuniorCharacter) : (body.juniorLevel ?? "EASY"),
      runId: run?.id ?? null,
    },
    select: { id: true },
  });
  const res: CreateSessionResponse = { sessionId: session.id };
  return json(res, 201);
});

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  const sessions = await db.session.findMany({
    where: { userId: user.userId },
    orderBy: { updatedAt: "desc" },
    include: sessionListInclude,
  });
  const body: SessionListItemDto[] = sessions.map(toSessionListItem);
  return json(body);
});
