/**
 * [① 게임 코어] 시험 결과 → LIFE 적용 (POST /runs/{id}/life, POST /runs/{id}/graduate).
 * 점수는 서버의 Session.score 만 믿는다. LifeEvent.sessionId unique 로 세션당 1회만 적용(멱등).
 */
import {
  lifeOutcomeFor,
  passScoreFor,
  type ApplyLifeResponse,
  type GraduateResponse,
  type GraduationSummaryDto,
  type JuniorCharacter,
  type LifeOutcome,
  type RunStatus,
} from "@/contracts/game";
import { db, Prisma } from "@/lib/server/db";
import { ApiError, invalidState } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { canGraduate, isCleared } from "@/lib/server/run-rules";
import { computeRunSummary, loadRun, progressRows, toRunDto } from "@/lib/server/run-dto";
import { noRun } from "@/lib/server/run-access";

const LIFE_STATUSES = ["RESULT_READY", "REVIEWING", "COMPLETED"];

export async function applyLife(userId: string, runId: string, sessionId: string): Promise<ApplyLifeResponse> {
  try {
    return await db.$transaction(async (tx) => {
      const run = await loadRun(tx, runId);
      if (!run || run.userId !== userId) throw noRun();
      const session = await tx.session.findFirst({
        where: { id: sessionId, userId },
        select: { id: true, runId: true, chapterId: true, status: true, score: true, kind: true },
      });
      if (!session) throw new ApiError("NOT_FOUND", "세션을 찾을 수 없습니다.");
      if (session.runId !== run.id) throw noRun("이 세션은 해당 후배 기록(Run)에 속하지 않습니다.");
      if (!LIFE_STATUSES.includes(session.status) || session.score === null) {
        throw invalidState("채점이 끝난 세션에만 LIFE 를 적용할 수 있습니다.");
      }

      const character = run.character as JuniorCharacter;
      const passScore = passScoreFor(character);
      const progressBefore = run.progress.find((p) => p.chapterId === session.chapterId);
      const isFinal = session.kind === "FINAL";
      const finalPassed = !!run.finalPassedAt;
      // 졸업시험은 챕터 진행 대신 "졸업시험 통과" 여부를 cleared 로 보고한다
      const wasCleared = isFinal ? finalPassed : (progressBefore?.cleared ?? false);
      const bestBefore = isFinal ? null : (progressBefore?.bestScore ?? null);

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
          chapter: { cleared: wasCleared, bestScore: bestBefore, firstClear: false },
          canGraduate: canGraduate(run.status, progressRows(run), finalPassed),
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
          chapter: { cleared: wasCleared, bestScore: bestBefore, firstClear: false },
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

      const bestScore = Math.max(bestBefore ?? -1, session.score);
      const cleared = wasCleared || isCleared(isFinal ? session.score : bestScore, passScore);
      if (!isFinal) {
        await tx.chapterProgress.upsert({
          where: { runId_chapterId: { runId: run.id, chapterId: session.chapterId } },
          create: { runId: run.id, chapterId: session.chapterId, attempts: 1, bestScore, cleared, clearedAt: cleared ? now : null },
          update: { attempts: { increment: 1 }, bestScore, cleared, ...(cleared && !wasCleared ? { clearedAt: now } : {}) },
        });
      }

      const gameOver = livesAfter === 0;
      await tx.juniorRun.update({
        where: { id: run.id },
        data: {
          lives: livesAfter,
          ...(gameOver ? { status: "GAME_OVER", endedAt: now } : {}),
          ...(isFinal && cleared && !finalPassed ? { finalPassedAt: now } : {}),
        },
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
        canGraduate: canGraduate(updated.status, progressRows(updated), !!updated.finalPassedAt),
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

export async function graduate(userId: string, runId: string): Promise<GraduateResponse> {
  return db.$transaction(async (tx) => {
    const run = await loadRun(tx, runId);
    if (!run || run.userId !== userId) throw noRun();
    if (run.status === "GRADUATED" && run.summaryJson) {
      return { run: toRunDto(run), summary: JSON.parse(run.summaryJson) as GraduationSummaryDto };
    }
    if (run.status !== "ACTIVE") throw new ApiError("NOT_READY", "이미 끝난 후배 기록입니다.");
    const rows = progressRows(run);
    if (!canGraduate(run.status, rows, !!run.finalPassedAt)) {
      const left = rows.filter((r) => !r.cleared).length;
      throw new ApiError("NOT_READY", left > 0
        ? `아직 통과하지 못한 챕터가 ${left}개 있습니다.`
        : "졸업시험을 통과해야 졸업할 수 있습니다.");
    }
    const now = new Date();
    const summary = await computeRunSummary(tx, run, now);
    await tx.juniorRun.update({
      where: { id: run.id },
      data: { status: "GRADUATED", endedAt: now, summaryJson: JSON.stringify(summary) },
    });
    return { run: toRunDto((await loadRun(tx, run.id))!), summary };
  });
}
