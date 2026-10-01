// [① 게임 코어 P2] GET /api/runs/album → {graduated: AlbumEntry[], departed: AlbumEntry[]} (최근 종료순)
import type { AlbumEntryDto, AlbumResponse, GraduationSummaryDto, JuniorCharacter } from "@/contracts/game";
import { GraduationSummarySchema } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

function summaryOf(raw: string | null): GraduationSummaryDto | null {
  if (!raw) return null;
  try {
    const p = GraduationSummarySchema.safeParse(JSON.parse(raw));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  const runs = await db.juniorRun.findMany({
    where: { userId: user.userId, status: { in: ["GRADUATED", "GAME_OVER"] }, endedAt: { not: null } },
    orderBy: { endedAt: "desc" },
    include: { material: { select: { id: true, title: true, courseName: true } } },
  });
  const entries: AlbumEntryDto[] = runs.map((r) => ({
    runId: r.id,
    character: r.character as JuniorCharacter,
    status: r.status as AlbumEntryDto["status"],
    materialId: r.material.id,
    materialTitle: r.material.title,
    courseName: r.material.courseName,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt!.toISOString(),
    summary: summaryOf(r.summaryJson),
  }));
  const body: AlbumResponse = { graduated: entries.filter((e) => e.status === "GRADUATED"), departed: entries.filter((e) => e.status === "GAME_OVER") };
  return json(body);
});
