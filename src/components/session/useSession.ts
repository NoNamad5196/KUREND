"use client";
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
  const version = useRef(0);

  const recover = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && failure.details.replacementSessionId) {
      setRedirecting(true);
      router.replace(`/session/${encodeURIComponent(failure.details.replacementSessionId)}/prepare`);
      return true;
    }
    return false;
  }, [router]);

  const reload = useCallback(async () => {
    const request = ++version.current;
    setLoading(true); setError(null); setRedirecting(false);
    try {
      const next = await api.get<SessionDto>(`/sessions/${encodeURIComponent(sessionId)}`);
      if (request !== version.current) return null;
      const guard = allowedRef.current;
      if (!(typeof guard === "function" ? guard(next) : guard.includes(next.status))) {
        setRedirecting(true);
        router.replace(routeForSession(next));
      } else setSession(next);
      return next;
    } catch (failure) {
      if (request !== version.current) return null;
      if (!recover(failure)) setError(failure instanceof ApiError ? failure : new ApiError("NETWORK", "학습 정보를 불러오지 못했습니다. 다시 시도해 주세요.", 0));
      return null;
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [sessionId, router, recover]);

  useEffect(() => {
    setSession(null);
    void reload();
    return () => { version.current += 1; };
  }, [reload]);

  return { session: session?.sessionId === sessionId ? session : null, setSession, loading, error, redirecting, reload, recover };
}
