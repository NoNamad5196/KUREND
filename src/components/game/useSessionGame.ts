"use client";
/**
 * [③] 세션의 게임 상태(GET /api/sessions/{id}/game). ①의 라우트가 없거나(404) 실패하면 null = 연습 모드로 조용히 처리한다.
 */
import { useCallback, useEffect, useState } from "react";
import type { SessionGameDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";

export function useSessionGame(sessionId: string | null | undefined) {
  const [game, setGame] = useState<SessionGameDto | null>(null);
  const [loading, setLoading] = useState(!!sessionId);
  const reload = useCallback(async () => {
    if (!sessionId) return null;
    try {
      const next = await gameApi.getSessionGame(sessionId);
      setGame(next);
      return next;
    } catch {
      setGame(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);
  useEffect(() => {
    let active = true;
    setLoading(!!sessionId);
    if (sessionId) {
      gameApi.getSessionGame(sessionId).then((g) => active && setGame(g)).catch(() => active && setGame(null)).finally(() => active && setLoading(false));
    }
    return () => { active = false; };
  }, [sessionId]);
  return { game, run: game?.run ?? null, loading, reload };
}
