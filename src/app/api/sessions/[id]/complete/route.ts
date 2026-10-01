// [C] POST /api/sessions/{id}/complete → {status:"COMPLETED", score, finalVerdict, openGapCount, chapter:{taughtAt, stableAt}}
//     RESULT_READY/REVIEWING 에서만. Chapter.taughtAt 세팅(최초 1회), gap 0개면 stableAt.
//     finalVerdict 는 evaluate(D) 가 저장한 값을 쓰고, 없으면 §4 규칙으로 계산한다.
import type { CompleteResponse, FinalVerdict } from "@/contracts/types";
import { finalVerdictFor } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";
import { assertStatus, loadOwnedSession } from "@/lib/server/session-access";

export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  assertStatus(session, ["RESULT_READY", "REVIEWING"], "학습 완료");

  const now = new Date();
  const gapCount = session.gaps.length;
  const openGapCount = session.gaps.filter((g) => g.status !== "REVIEWED").length;
  const score = session.score ?? session.exam?.grades.reduce((acc, g) => acc + g.score, 0) ?? null;
  const finalVerdict: FinalVerdict | null =
    (session.finalVerdict as FinalVerdict | null) ?? (score === null ? null : finalVerdictFor(score, gapCount));

  const [, chapter] = await db.$transaction([
    db.session.update({
      where: { id: session.id },
      data: { status: "COMPLETED", completedAt: now, score, finalVerdict },
    }),
    db.chapter.update({
      where: { id: session.chapterId },
      data: {
        taughtAt: session.chapter.taughtAt ?? now,
        ...(gapCount === 0 && !session.chapter.stableAt ? { stableAt: now } : {}),
      },
      select: { taughtAt: true, stableAt: true },
    }),
  ]);

  const body: CompleteResponse = {
    status: "COMPLETED",
    score,
    finalVerdict,
    openGapCount,
    chapter: {
      taughtAt: chapter.taughtAt ? chapter.taughtAt.toISOString() : null,
      stableAt: chapter.stableAt ? chapter.stableAt.toISOString() : null,
    },
  };
  return json(body);
});
