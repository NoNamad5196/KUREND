// [C] GET /api/auth/demo-accounts → [{userId, nickname}]
import type { DemoAccountDto } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, nickname: true } });
  const body: DemoAccountDto[] = users.map((u) => ({ userId: u.id, nickname: u.nickname }));
  return json(body);
});
