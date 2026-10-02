// [① 게임 코어 P2] GET /api/runs/album → {graduated, departed: AlbumEntry[] (최근 종료순), active: RunDto[] (재학생, 최근 활동순)}
import type { AlbumEntryDto, AlbumResponse, GraduationSummaryDto, JuniorCharacter } from "@/contracts/game";
import { GraduationSummarySchema } from "@/contracts/game";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";
import { runInclude, toRunDto } from "@/lib/server/run-dto";

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
  // 미졸업 탭: 아직 가르치는 중인 후배(재학생·졸업 직전). 졸업 실패(GAME_OVER)는 departed 로 같은 탭에 표시한다.
  const activeRuns = await db.juniorRun.findMany({ where: { userId: user.userId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, include: runInclude });
  const body: AlbumResponse = {
    graduated: entries.filter((e) => e.status === "GRADUATED"),
    departed: entries.filter((e) => e.status === "GAME_OVER"),
    active: activeRuns.map(toRunDto),
  };
  return json(body);
});
