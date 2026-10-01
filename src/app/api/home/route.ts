// [C] GET /api/home → §5-3 홈 객체
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";
import { buildHomeDto, homeMaterialInclude } from "@/lib/server/material-dto";

export const dynamic = "force-dynamic";
const RECENT_LIMIT = 5;

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  const [materials, recentSessions, completedSessions] = await Promise.all([
    db.material.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "asc" },
      include: homeMaterialInclude,
    }),
    db.session.findMany({
      where: { userId: user.userId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      include: { chapter: { select: { title: true, material: { select: { title: true } } } } },
    }),
    db.session.findMany({
      where: { userId: user.userId, status: "COMPLETED" },
      select: { score: true, completedAt: true, updatedAt: true },
    }),
  ]);
  return json(buildHomeDto({ user, materials, recentSessions, completedSessions }));
});
