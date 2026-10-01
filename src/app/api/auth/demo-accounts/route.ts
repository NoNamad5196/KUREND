// [C] GET /api/auth/demo-accounts → [{userId, nickname}]
import type { DemoAccountDto } from "@/contracts/types";
import { db } from "@/lib/server/db";
import { allowedDemoUserIds } from "@/lib/server/demo-auth";
import { json, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  // 운영에서는 공개 체험 계정 하나만 보인다(allowedDemoUserIds).
  const users = await db.user.findMany({ where: { id: { in: allowedDemoUserIds() } }, orderBy: { createdAt: "asc" }, select: { id: true, nickname: true } });
  const body: DemoAccountDto[] = users.map((u) => ({ userId: u.id, nickname: u.nickname }));
  return json(body);
});
