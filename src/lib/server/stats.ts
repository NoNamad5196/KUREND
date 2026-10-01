/** [C 소유] 홈/프로필 통계: 연속 학습일, D-day, 평균 점수 */
import { differenceInCalendarDays, startOfDay } from "date-fns";

/** 'YYYY-MM-DD' (로컬 날짜) */
export function toDateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' → 로컬 자정 Date. 형식이 틀리면 null */
export function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d;
}

/** 시험일까지 남은 날 수 (오늘=0, 지났으면 음수) */
export function dDayFor(examDate: Date | null | undefined, now = new Date()): number | null {
  if (!examDate) return null;
  return differenceInCalendarDays(startOfDay(examDate), startOfDay(now));
}

/**
 * 연속 학습일: 완료 세션이 있는 날이 오늘(또는 어제)부터 끊기지 않고 이어진 일수.
 * 오늘도 어제도 활동이 없으면 0.
 */
export function streakDays(activityDates: Date[], now = new Date()): number {
  const days = new Set(activityDates.map((d) => toDateOnly(d)));
  if (days.size === 0) return 0;
  const cursor = startOfDay(now);
  if (!days.has(toDateOnly(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(toDateOnly(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function averageScore(scores: Array<number | null>): number | null {
  const xs = scores.filter((s): s is number => typeof s === "number");
  if (xs.length === 0) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}
