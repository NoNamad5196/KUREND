"use client";
/**
 * 세션 페이지 공통 훅: 진입 시 GET /sessions/{id} 로 상태를 읽고,
 * 허용되지 않은 상태면 routeForSession() 경로로 리다이렉트한다 (§12-B 4. 새로고침 복원).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionDto, SessionStatus } from "@/contracts/types";
import { api, ApiError, routeForSession } from "./_api";

export type SessionGuard = SessionStatus[] | ((s: SessionDto) => boolean);

export function useSession(sessionId: string, allowed: SessionGuard) {
  const router = useRouter();
  const [session, setSession] = useState<SessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;

  const isAllowed = useCallback((s: SessionDto) => {
    const a = allowedRef.current;
    return typeof a === "function" ? a(s) : a.includes(s.status);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.get<SessionDto>(`/sessions/${sessionId}`);
      if (!isAllowed(s)) {
        setRedirecting(true);
        router.replace(routeForSession(s));
        return s;
      }
      setSession(s);
      return s;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("NETWORK", (e as Error).message, 0));
      return null;
    } finally {
      setLoading(false);
    }
  }, [sessionId, isAllowed, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { session, setSession, loading, error, redirecting, reload };
}
