/**
 * [① 게임 코어] 시험 결과 → LIFE 적용 (POST /runs/{id}/life, POST /runs/{id}/graduate).
 * 점수는 서버의 Session.score 만 믿는다. LifeEvent.sessionId unique 로 세션당 1회만 적용(멱등).
 */
import {
  lifeOutcomeFor,
  passScoreFor,
  type ApplyLifeResponse,
  type GraduationSummaryDto,
  type JuniorCharacter,
  type LifeOutcome,
  type RunStatus,
} from "@/contracts/game";
import { db, Prisma } from "@/lib/server/db";
import { ApiError, invalidState } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { canGraduate, isCleared } from "@/lib/server/run-rules";
import { computeRunSummary, loadRun, progressRows } from "@/lib/server/run-dto";
import { noRun } from "@/lib/server/run-access";

const LIFE_STATUSES = ["RESULT_READY", "REVIEWING", "COMPLETED"];

export async function applyLife(userId: string, runId: string, sessionId: string): Promise<ApplyLifeResponse> {
  try {
    return await db.$transaction(async (tx) => {
      const run = await loadRun(tx, runId);
      if (!run || run.userId !== userId) throw noRun();
      const session = await tx.session.findFirst({
        where: { id: sessionId, userId },
        select: { id: true, runId: true, chapterId: true, status: true, score: true },
      });
      if (!session) throw new ApiError("NOT_FOUND", "세션을 찾을 수 없습니다.");
      if (session.runId !== run.id) throw noRun("이 세션은 해당 후배 기록(Run)에 속하지 않습니다.");
      if (!LIFE_STATUSES.includes(session.status) || session.score === null) {
        throw invalidState("채점이 끝난 세션에만 LIFE 를 적용할 수 있습니다.");
      }

      const character = run.character as JuniorCharacter;
      const passScore = passScoreFor(character);
      const progressBefore = run.progress.find((p) => p.chapterId === session.chapterId);
      const wasCleared = progressBefore?.cleared ?? false;

      // 이미 적용됨 → 그대로 돌려준다
      const existing = await tx.lifeEvent.findUnique({ where: { sessionId } });
      if (existing) {
        return {
          applied: false,
          outcome: existing.outcome as LifeOutcome,
          score: existing.score,
          passScore: existing.passScore,
          livesBefore: existing.livesBefore,
          livesAfter: existing.livesAfter,
          maxLives: run.maxLives,
          runStatus: run.status as RunStatus,
          chapter: { cleared: wasCleared, bestScore: progressBefore?.bestScore ?? null, firstClear: false },
          canGraduate: canGraduate(run.status, progressRows(run)),
        };
      }
      // Run 이 이미 끝났으면 적용하지 않는다(남은 세션은 끝낼 수 있음)
      if (run.status !== "ACTIVE") {
        return {
          applied: false,
          outcome: "NONE",
          score: session.score,
          passScore,
          livesBefore: run.lives,
          livesAfter: run.lives,
          maxLives: run.maxLives,
          runStatus: run.status as RunStatus,
          chapter: { cleared: wasCleared, bestScore: progressBefore?.bestScore ?? null, firstClear: false },
          canGraduate: false,
        };
      }

      const { outcome, delta } = lifeOutcomeFor({ score: session.score, passScore, lives: run.lives, maxLives: run.maxLives });
      const livesAfter = Math.max(0, Math.min(run.maxLives, run.lives + delta));
      const now = new Date();

      await tx.lifeEvent.create({
        data: {
          id: newId("lev"),
          runId: run.id,
          sessionId,
          chapterId: session.chapterId,
          outcome,
          delta: livesAfter - run.lives,
          livesBefore: run.lives,
          livesAfter,
          score: session.score,
          passScore,
          createdAt: now,
        },
      });

      const bestScore = Math.max(progressBefore?.bestScore ?? -1, session.score);
      const cleared = wasCleared || isCleared(bestScore, passScore);
      await tx.chapterProgress.upsert({
        where: { runId_chapterId: { runId: run.id, chapterId: session.chapterId } },
        create: { runId: run.id, chapterId: session.chapterId, attempts: 1, bestScore, cleared, clearedAt: cleared ? now : null },
        update: { attempts: { increment: 1 }, bestScore, cleared, ...(cleared && !wasCleared ? { clearedAt: now } : {}) },
      });

      const gameOver = livesAfter === 0;
      await tx.juniorRun.update({
        where: { id: run.id },
        data: { lives: livesAfter, ...(gameOver ? { status: "GAME_OVER", endedAt: now } : {}) },
      });
      const updated = (await loadRun(tx, run.id))!;
      if (gameOver) {
        const summary = await computeRunSummary(tx, updated, now);
        await tx.juniorRun.update({ where: { id: run.id }, data: { summaryJson: JSON.stringify(summary) } });
      }
      return {
        applied: true,
        outcome,
        score: session.score,
        passScore,
        livesBefore: run.lives,
        livesAfter,
        maxLives: run.maxLives,
        runStatus: updated.status as RunStatus,
        chapter: { cleared, bestScore, firstClear: cleared && !wasCleared },
        canGraduate: canGraduate(updated.status, progressRows(updated)),
      };
    });
  } catch (err) {
    // 동시 요청이 먼저 LifeEvent 를 만든 경우 → 다시 읽어 applied:false 로 응답
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return applyLife(userId, runId, sessionId);
    }
    throw err;
  }
}

export async function graduate(userId: string, runId: string): Promise<GraduationSummaryDto> {
  return db.$transaction(async (tx) => {
    const run = await loadRun(tx, runId);
    if (!run || run.userId !== userId) throw noRun();
    if (run.status === "GRADUATED" && run.summaryJson) return JSON.parse(run.summaryJson) as GraduationSummaryDto;
    if (run.status !== "ACTIVE") throw new ApiError("NOT_READY", "이미 끝난 후배 기록입니다.");
    const rows = progressRows(run);
    if (!canGraduate(run.status, rows)) {
      const left = rows.filter((r) => !r.cleared).length;
      throw new ApiError("NOT_READY", `아직 통과하지 못한 챕터가 ${left}개 있습니다.`);
    }
    const now = new Date();
    const summary = await computeRunSummary(tx, run, now);
    await tx.juniorRun.update({
      where: { id: run.id },
      data: { status: "GRADUATED", endedAt: now, summaryJson: JSON.stringify(summary) },
    });
    return summary;
  });
}
