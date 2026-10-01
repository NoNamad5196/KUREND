// [C] GET /api/auth/demo-accounts → [{userId, nickname}]
import type { DemoAccountDto } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { DEMO_USER_IDS, demoAuthEnabled } from "@/lib/server/demo-auth";
import { json, notFound, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  if (!demoAuthEnabled()) throw notFound();
  const users = await db.user.findMany({ where: { id: { in: DEMO_USER_IDS } }, orderBy: { createdAt: "asc" }, select: { id: true, nickname: true } });
  const body: DemoAccountDto[] = users.map((u) => ({ userId: u.id, nickname: u.nickname }));
  return json(body);
});
