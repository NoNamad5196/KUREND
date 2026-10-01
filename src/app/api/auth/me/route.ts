// [C] GET /api/auth/me → {userId, nickname, streakDays}
import type { MeDto } from "@/contracts/types";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";
import { streakDays } from "@/lib/server/stats";

export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  const completed = await db.session.findMany({
    where: { userId: user.userId, status: "COMPLETED" },
    select: { completedAt: true, updatedAt: true },
  });
  const body: MeDto = {
    userId: user.userId,
    nickname: user.nickname,
    streakDays: streakDays(completed.map((s) => s.completedAt ?? s.updatedAt)),
  };
  return json(body);
});
