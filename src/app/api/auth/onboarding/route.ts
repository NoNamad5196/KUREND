import type { OkResponse } from "@/contracts/types";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** 최초 완료 시각을 보존한다. 다시 보기/중복 요청도 같은 결과를 돌려준다. */
export const POST = withApi(async (req) => {
  const user = await requireUser(req);
  await db.user.updateMany({
    where: { id: user.userId, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
  return json<OkResponse>({ ok: true });
});
