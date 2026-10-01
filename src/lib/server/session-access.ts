/**
 * [C 소유] 세션 로드 + 소유자 검증 + 상태 검증. D 의 라우트도 import 해서 쓴다.
 *
 *   const s = await loadOwnedSession(req, id);                 // 404 if not mine
 *   assertStatus(s, ["EXPLAINING"]);                            // 409 INVALID_STATE
 */
import type { SessionStatus } from "@/contracts/types";
import { STAGE_LABELS } from "@/contracts/types";
import { requireUser, type AuthUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ApiError, invalidState } from "@/lib/server/http";
import { sessionInclude, type SessionWithRelations } from "@/lib/server/session-dto";

export async function findOwnedSession(userId: string, sessionId: string): Promise<SessionWithRelations> {
  const session = await db.session.findFirst({ where: { id: sessionId, userId }, include: sessionInclude });
  if (!session) throw new ApiError("NOT_FOUND", "학습 정보를 불러오지 못했습니다. 자료 화면에서 다시 시작해 주세요.", 404, { reason: "SESSION_NOT_FOUND" });
  if (session.replacementSessionId) throw new ApiError("INVALID_STATE", "선택한 후배의 학습 세션을 다시 불러오고 있어요.", 409, {
    reason: "CHAT_SESSION_INVALID", replacementSessionId: session.replacementSessionId, materialId: session.chapter.material.id,
  });
  return session;
}

export async function loadOwnedSession(
  req: Request,
  sessionId: string,
): Promise<{ user: AuthUser; session: SessionWithRelations }> {
  const user = await requireUser(req);
  const session = await findOwnedSession(user.userId, sessionId);
  return { user, session };
}

export function assertStatus(session: { status: string }, allowed: SessionStatus[], what?: string): void {
  if (!allowed.includes(session.status as SessionStatus)) {
    const now = STAGE_LABELS[session.status as SessionStatus] ?? session.status;
    throw invalidState(
      `${what ?? "이 작업"}은(는) ${allowed.map((s) => STAGE_LABELS[s]).join("/")} 상태에서만 가능합니다. (현재: ${now})`,
    );
  }
}
