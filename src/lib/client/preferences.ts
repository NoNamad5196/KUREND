/**
 * 클라이언트 환경설정 (localStorage, 이 기기에만 저장).
 *
 *   const prefs = usePreferences();            // { reduceMotion, instantTyping, examAutoAdvance, resultSound }
 *   setPreference("resultSound", true);        // 저장 + 같은 탭/다른 탭 구독자에게 알림
 *   getPreferences().instantTyping             // 훅 밖(이벤트 핸들러 등)에서 읽기
 *   useApplyPreferences();                     // 전역에 한 번: reduceMotion → <html data-reduce-motion="1">
 *
 * instantTyping · examAutoAdvance 는 시험 화면의 "보기 설정"(kurend.examView 의 instant · autoAdvance)과
 * 양방향으로 맞춰 둔다: 읽을 때는 그쪽 값을 우선하고, 쓸 때는 두 곳에 함께 쓴다.
 * 모든 저장소 접근은 try/catch — 사생활 보호 모드 등에서 실패하면 기본값/메모리 값으로 동작한다.
 */
import { useEffect, useSyncExternalStore } from "react";

export const ONBOARDING_KEY = "kurend.onboarded.v1";
export const PREFERENCES_KEY = "kurend.prefs.v1";
/** src/components/exam/ViewSettings.tsx 의 저장 키 (instant · autoAdvance · showThought) */
const EXAM_VIEW_KEY = "kurend.examView";

export type Preferences = {
  /** 애니메이션 최소화 (OS 설정과 별개로 앱 안에서 켜기) */
  reduceMotion: boolean;
  /** 후배 답안·말 타이핑 연출 없이 한 번에 보기 */
  instantTyping: boolean;
  /** 시험 문항 답안이 끝나면 다음 문항으로 자동 진행 */
  examAutoAdvance: boolean;
  /** 합격·졸업 결과 효과음 */
  resultSound: boolean;
};
export type PreferenceKey = keyof Preferences;

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  reduceMotion: false,
  instantTyping: false,
  examAutoAdvance: true,
  resultSound: false,
});

const listeners = new Set<() => void>();
let cache: Preferences | null = null;

function readObject(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function writeObject(key: string, value: Record<string, unknown>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가(용량·사생활 보호 모드) — 이번 탭의 메모리 값으로만 유지 */
  }
}

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  const own = readObject(PREFERENCES_KEY) ?? {};
  const exam = readObject(EXAM_VIEW_KEY) ?? {};
  return {
    reduceMotion: bool(own.reduceMotion, DEFAULT_PREFERENCES.reduceMotion),
    instantTyping: bool(exam.instant, bool(own.instantTyping, DEFAULT_PREFERENCES.instantTyping)),
    examAutoAdvance: bool(exam.autoAdvance, bool(own.examAutoAdvance, DEFAULT_PREFERENCES.examAutoAdvance)),
    resultSound: bool(own.resultSound, DEFAULT_PREFERENCES.resultSound),
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== PREFERENCES_KEY && event.key !== EXAM_VIEW_KEY) return;
  cache = readPreferences();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = () => DEFAULT_PREFERENCES as Preferences;

/** 현재 설정 (SSR 에서는 기본값). 같은 값이면 같은 객체를 돌려준다. */
export function getPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES as Preferences;
  if (!cache) cache = readPreferences();
  return cache;
}

export function setPreference<K extends PreferenceKey>(key: K, value: Preferences[K]): void {
  if (typeof window === "undefined") return;
  const next: Preferences = { ...getPreferences(), [key]: value };
  cache = next;
  writeObject(PREFERENCES_KEY, { ...next });
  if (key === "instantTyping" || key === "examAutoAdvance") {
    const exam = readObject(EXAM_VIEW_KEY) ?? {};
    writeObject(EXAM_VIEW_KEY, { ...exam, [key === "instantTyping" ? "instant" : "autoAdvance"]: value });
  }
  if (key === "reduceMotion") applyReduceMotion(Boolean(value));
  emit();
}

/** 설정 구독 훅. 서버 렌더·하이드레이션 중에는 기본값, 이후 저장된 값으로 바뀐다. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getPreferences, serverSnapshot);
}

/** <html data-reduce-motion="1"> 토글. 실제 애니메이션 끄기 규칙은 components/profile/reduce-motion.css */
export function applyReduceMotion(on: boolean): void {
  if (typeof document === "undefined") return;
  try {
    if (on) document.documentElement.setAttribute("data-reduce-motion", "1");
    else document.documentElement.removeAttribute("data-reduce-motion");
  } catch {
    /* noop */
  }
}

/** 저장된 reduceMotion 을 <html> 에 반영한다. 앱 전역에 한 번 마운트되는 컴포넌트에서 호출. */
export function useApplyPreferences(): void {
  const { reduceMotion } = usePreferences();
  useEffect(() => {
    applyReduceMotion(reduceMotion);
  }, [reduceMotion]);
}

/* ── OS 의 "동작 줄이기" + 앱 설정을 합친 값 (JS 로 돌리는 연출을 멈출 때) ── */
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeMotion(listener: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener?.("change", listener);
  return () => mq.removeEventListener?.("change", listener);
}
function systemReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

export function useReducedMotion(): boolean {
  const system = useSyncExternalStore(subscribeMotion, systemReducedMotion, () => false);
  const { reduceMotion } = usePreferences();
  return system || reduceMotion;
}
