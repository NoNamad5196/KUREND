"use client";
/**
 * 첫 실행 온보딩 (4장). 앱 전역에 한 번 마운트한다: <Onboarding />
 *  - localStorage[ONBOARDING_KEY] 가 있으면 아무것도 그리지 않는다. 끝내거나 건너뛰면 "1" 을 쓴다.
 *  - /login 에서는 숨긴다(로그인 후 첫 화면에서 열린다).
 *  - 다음/이전/점 버튼 + ←/→ 키, Esc = 건너뛰기. 스와이프 없음.
 *  - resetOnboarding() 을 부르면 키를 지우고, 마운트된 온보딩이 바로 다시 열린다.
 *  - 저장된 "움직임 줄이기" 설정을 <html> 에 반영한다(useApplyPreferences).
 */
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ONBOARDING_KEY, useApplyPreferences } from "@/lib/client/preferences";
import { Button } from "@/components/shell/ui";
import { SLIDES } from "./slides";
import "./onboarding.css";
import "@/components/profile/reduce-motion.css";

const OPEN_EVENT = "kurend:onboarding-open";
const HIDDEN_PATHS = ["/login"];
const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function hasSeen(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) !== null;
  } catch {
    return true; // 저장소를 못 쓰면 매번 띄우지 않는다
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    /* noop */
  }
}

/** 온보딩 다시 보기: 완료 표시를 지우고 마운트된 <Onboarding /> 를 처음 장부터 연다. */
export function resetOnboarding(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    /* noop */
  }
  try {
    window.dispatchEvent(new Event(OPEN_EVENT));
  } catch {
    /* noop */
  }
}

export function Onboarding() {
  useApplyPreferences();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasSeen()) setOpen(true);
    const reopen = () => {
      setIndex(0);
      setDir(1);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  const visible = open && !HIDDEN_PATHS.includes(pathname ?? "");
  const last = index === SLIDES.length - 1;

  const go = useCallback((to: number) => {
    const target = Math.max(0, Math.min(SLIDES.length - 1, to));
    if (target === index) return;
    setDir(target > index ? 1 : -1);
    setIndex(target);
  }, [index]);

  const close = useCallback((toNew = false) => {
    markSeen();
    setOpen(false);
    if (toNew) router.push("/new");
  }, [router]);

  // 열려 있는 동안 배경 스크롤 잠금 + 닫힐 때 포커스 복귀
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [visible]);

  // 장이 바뀔 때마다 주 버튼으로 포커스
  useEffect(() => {
    if (!visible) return;
    panel.current?.querySelector<HTMLElement>("[data-ob-primary]")?.focus({ preventScroll: true });
  }, [visible, index]);

  // ←/→ 이동, Esc 건너뛰기, Tab 은 대화상자 안에서만 돈다
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Tab" && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        const active = document.activeElement;
        if (!panel.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && active === lastItem) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, index, close, go]);

  if (!visible) return null;
  const slide = SLIDES[index];
  const Visual = slide.visual;

  return (
    <div className="ob-backdrop fixed inset-0 z-[45] flex items-stretch justify-center bg-ink/45 sm:items-center sm:p-6" role="presentation">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        aria-describedby="ob-body"
        className="ob-panel relative flex w-full flex-col overflow-hidden bg-bg sm:h-[min(680px,calc(100dvh-3rem))] sm:max-w-[28rem] sm:rounded-card sm:border sm:border-line sm:shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span className="text-base font-black tracking-tight text-primary">새내기<span className="ml-1.5 text-[11px] font-semibold tracking-normal text-muted">KUREND</span></span>
          <button type="button" onClick={() => close()} className="min-h-11 rounded-[10px] px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
            건너뛰기
          </button>
        </header>

        <p className="sr-only" aria-live="polite">{`${index + 1} / ${SLIDES.length} 단계: ${slide.title}`}</p>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-5">
          <div key={slide.id} className="ob-slide flex min-h-full flex-col justify-center gap-6 py-4" data-dir={dir}>
            <div className="flex items-center justify-center">
              <Visual />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-primary">{slide.eyebrow}</p>
              <h2 id="ob-title" className="mt-1.5 text-2xl font-bold tracking-tight">{slide.title}</h2>
              <p id="ob-body" className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{slide.body}</p>
            </div>
          </div>
        </div>

        <footer className="border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex justify-center gap-0.5" role="group" aria-label="안내 단계">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`${i + 1}번째 안내: ${s.title}`}
                aria-current={i === index ? "step" : undefined}
                className="grid h-7 min-w-7 place-items-center rounded-full px-1"
              >
                <span className={clsx("ob-dot block h-2 rounded-full", i === index ? "w-6 bg-primary" : "w-2 bg-line")} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {last ? (
              <>
                <Button variant="secondary" className="flex-1" onClick={() => close()}>둘러보기</Button>
                <Button data-ob-primary className="flex-[1.6]" onClick={() => close(true)}>첫 자료 올리러 가기</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" className={clsx("flex-1", index === 0 && "invisible")} disabled={index === 0} onClick={() => go(index - 1)}>이전</Button>
                <Button data-ob-primary className="flex-[1.6]" onClick={() => go(index + 1)}>다음</Button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
