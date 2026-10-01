"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadAchievementInputs, type AchievementInputs } from "@/lib/client/achievements";

/** 업적·프로필 화면 공용 로더. reload() 는 오류 후 "다시 시도" 용 */
export function useAchievementInputs(fallbackError = "기록을 불러오지 못했어요.") {
  const [data, setData] = useState<AchievementInputs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);

  const reload = useCallback(() => {
    const mine = ++ticket.current;
    setError(null);
    loadAchievementInputs()
      .then((value) => { if (ticket.current === mine) setData(value); })
      .catch((e: unknown) => { if (ticket.current === mine) setError(e instanceof Error && e.message ? e.message : fallbackError); });
  }, [fallbackError]);

  useEffect(() => {
    const counter = ticket; // 언마운트 시 진행 중인 응답을 버린다
    reload();
    return () => { counter.current++; };
  }, [reload]);

  return { data, error, reload };
}
