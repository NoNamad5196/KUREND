"use client";
/**
 * 세션의 게임 상태(GET /api/sessions/{id}/game). run:null은 연습 모드,
 * error는 조회 실패로 구분한다. 재조회 실패 시 이미 확인한 후배 정보는 유지한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionGameDto } from "@/contracts/game";
import { ApiError } from "@/lib/client/api";
import { gameApi } from "@/lib/client/game-api";

export function useSessionGame(sessionId: string | null | undefined) {
  const [state, setState] = useState<{ sessionId: typeof sessionId; game: SessionGameDto | null; loading: boolean; error: ApiError | null }>({
    sessionId, game: null, loading: !!sessionId, error: null,
  });
  const requestRef = useRef(0);
  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    if (!sessionId) {
      setState({ sessionId, game: null, loading: false, error: null });
      return null;
    }
    setState((previous) => ({ sessionId, game: previous.sessionId === sessionId ? previous.game : null, loading: true, error: null }));
    try {
      const next = await gameApi.getSessionGame(sessionId);
      if (request === requestRef.current) setState({ sessionId, game: next, loading: false, error: null });
      return next;
    } catch (cause) {
      if (request === requestRef.current) setState((previous) => ({ ...previous, loading: false,
        error: cause instanceof ApiError ? cause : new ApiError("NETWORK", "후배 정보를 불러오지 못했습니다. 다시 시도해 주세요.", 0),
      }));
      return null;
    }
  }, [sessionId]);
  useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);
  // A route change must never show the previous session's character, even
  // before its effect runs or while an older request is still resolving.
  const current = state.sessionId === sessionId;
  const game = current ? state.game : null;
  const loading = current ? state.loading : !!sessionId;
  const error = current ? state.error : null;
  // A successful run:null response confirms practice mode. Until then, avoid
  // substituting the generic mascot for an unknown selected character.
  const identityPending = !!sessionId && !game;
  return { game, run: game?.run ?? null, loading, error, identityPending, reload };
}
