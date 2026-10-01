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
import { invalidState, notFound } from "@/lib/server/http";
import { sessionInclude, type SessionWithRelations } from "@/lib/server/session-dto";

export async function findOwnedSession(userId: string, sessionId: string): Promise<SessionWithRelations> {
  const session = await db.session.findFirst({ where: { id: sessionId, userId }, include: sessionInclude });
  if (!session) throw notFound("세션을 찾을 수 없습니다.");
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
