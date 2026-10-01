// [① 게임 코어] POST /api/runs/{id}/final → {sessionId, created}
// 모든 챕터를 통과한 ACTIVE Run 만 졸업시험(FINAL, 자료 전체 · 10문항 객관식+서술형 혼합)을 볼 수 있다.
// 진행 중인 졸업시험이 있으면 그 세션을 돌려준다. 새 세션에는 지금까지 챕터에서 가르친 선배 설명을 그대로 옮겨 담는다.
import type { StartFinalResponse } from "@/contracts/game";
import { levelFor, type JuniorCharacter } from "@/contracts/game";
import { db } from "@/lib/server/db";
import { ApiError, json, withApi } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/auth";
import { loadRun, progressRows } from "@/lib/server/run-dto";
import { allChaptersCleared } from "@/lib/server/run-rules";

export const dynamic = "force-dynamic";

const OPEN = ["PREPARING", "EXPLAINING", "EXAM_IN_PROGRESS", "EVALUATING"];
/** 옮겨 담는 설명 상한(최근 것 우선) */
const CARRY_LIMIT = 80;

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  return db.$transaction(async (tx) => {
    const run = await loadRun(tx, params.id);
    if (!run || run.userId !== user.userId) throw new ApiError("NO_RUN", "후배 기록을 찾을 수 없습니다.");
    if (run.status !== "ACTIVE") throw new ApiError("NOT_READY", "이미 끝난 후배 기록입니다.");
    if (run.finalPassedAt) throw new ApiError("NOT_READY", "이미 졸업시험을 통과했어요. 졸업식으로 가세요.");
    const rows = progressRows(run);
    if (!allChaptersCleared(run.status, rows)) {
      const left = rows.filter((r) => !r.cleared).length;
      throw new ApiError("NOT_READY", `모든 챕터를 통과해야 졸업시험을 볼 수 있어요. (남은 챕터 ${left}개)`);
    }
    const open = run.sessions.find((s) => OPEN.includes(s.status));
    if (open) {
      const body: StartFinalResponse = { sessionId: open.id, created: false };
      return json(body);
    }

    const lastChapter = run.material.chapters.at(-1)!;
    const taught = await tx.message.findMany({
      where: { role: "USER", excluded: false, session: { runId: run.id, kind: "CHAPTER", userId: user.userId, replacementSessionId: null, OR: [{ character: run.character }, { character: null }] } },
      orderBy: { createdAt: "desc" },
      take: CARRY_LIMIT,
      select: { content: true, stage: true },
    });
    taught.reverse();

    const sessionId = newId("sess");
    const base = Date.now();
    await tx.session.create({
      data: {
        id: sessionId,
        userId: user.userId,
        chapterId: lastChapter.id,
        status: "PREPARING",
        phase: "QUESTION",
        juniorLevel: levelFor(run.character as JuniorCharacter),
        runId: run.id,
        character: run.character,
        kind: "FINAL",
        messages: {
          create: taught.map((m, i) => ({
            id: newId("msg"),
            role: "USER",
            stage: m.stage,
            content: m.content,
            createdAt: new Date(base - (taught.length - i) * 1000),
          })),
        },
      },
    });
    const body: StartFinalResponse = { sessionId, created: true };
    return json(body, 201);
  });
});
