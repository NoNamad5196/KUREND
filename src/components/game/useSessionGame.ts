"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionGameDto } from "@/contracts/game";
import { ApiError } from "@/lib/client/api";
import { gameApi } from "@/lib/client/game-api";

export function useSessionGame(sessionId: string | null | undefined) {
  const [state, setState] = useState<{ id: string; game: SessionGameDto } | null>(null);
  const [loading, setLoading] = useState(!!sessionId);
  const [error, setError] = useState<ApiError | null>(null);
  const version = useRef(0);
  const reload = useCallback(async () => {
    const request = ++version.current;
    setLoading(!!sessionId); setError(null);
    if (!sessionId) { setState(null); return null; }
    try {
      const next = await gameApi.getSessionGame(sessionId);
      if (request === version.current) setState({ id: sessionId, game: next });
      return next;
    } catch (failure) {
      if (request === version.current) {
        setState(null);
        setError(failure instanceof ApiError ? failure : new ApiError("NETWORK", "후배 정보를 불러오지 못했습니다. 다시 시도해 주세요.", 0));
      }
      return null;
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [sessionId]);
  useEffect(() => {
    setState(null);
    void reload();
    return () => { version.current += 1; };
  }, [reload]);
  const game = state && state.id === sessionId ? state.game : null;
  return { game, run: game?.run ?? null, loading, error, reload };
}
