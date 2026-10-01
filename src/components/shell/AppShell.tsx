"use client";

import { createContext, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { api, ApiError } from "@/lib/client/api";
import type { MeDto, HomeDto } from "@/contracts/types";
import { onboardingRedirect } from "@/lib/client/auth-routing";
import { useApplyPreferences } from "@/lib/client/preferences";
import { gameApi, RUN_CHANGED_EVENT } from "@/lib/client/game-api";
import type { RunDto } from "@/contracts/game";
import { Button } from "./ui";
import { HeaderJunior } from "./HeaderJunior";
import "@/components/profile/reduce-motion.css";

const links = [
  { href: "/", label: "홈", icon: "⌂" },
  { href: "/new", label: "새 자료", icon: "＋" },
  { href: "/sessions", label: "내 세션", icon: "◷" },
  { href: "/wrong-notes", label: "오답노트", icon: "✎" },
  { href: "/album", label: "졸업앨범", icon: "🎓" },
  { href: "/map", label: "지식 지도", icon: "◈" },
  { href: "/achievements", label: "업적", icon: "★" },
];

/** 앱 설정의 "움직임 줄이기"를 <html> 에 반영 (모든 인증 화면 공통) */
function PreferencesEffect() {
  useApplyPreferences();
  return null;
}

const CurrentUser = createContext<MeDto | null>(null);

export function useCurrentUser() {
  const user = useContext(CurrentUser);
  if (!user) throw new Error("인증된 화면에서만 사용자 정보를 읽을 수 있습니다.");
  return user;
}

function AuthLoading() {
  return <div className="auth-loading" role="status"><span className="brand-mark" aria-hidden="true">KUREND</span><span className="auth-loading-line" aria-hidden="true" /><span className="text-xs text-muted">로그인 상태를 확인하는 중…</span></div>;
}

function AuthenticatedShell({ children, pathname, onboardingMode }: { children: ReactNode; pathname: string; onboardingMode: string | null }) {
  const router = useRouter();
  const [user, setUser] = useState<MeDto | null>(null);
  const [stats, setStats] = useState<HomeDto["stats"] | null>(null);
  const [run, setRun] = useState<RunDto | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const verifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    let active = true;
    const refreshRun = () => { gameApi.getCurrentRun().then((current) => { if (active) setRun(current); }).catch(() => {}); };
    window.addEventListener(RUN_CHANGED_EVENT, refreshRun);
    return () => { active = false; window.removeEventListener(RUN_CHANGED_EVENT, refreshRun); };
  }, []);

  useEffect(() => {
    let active = true;
    let pending = false;
    const refreshUser = () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      api.get<MeDto>("/auth/me").then((me) => {
        if (!active) return;
        const redirect = onboardingRedirect(me, pathname, onboardingMode);
        if (redirect) { router.replace(redirect); return; }
        if (verifiedUserId.current !== me.userId) {
          setStats(null);
          setRun(undefined);
          verifiedUserId.current = me.userId;
        }
        setAuthError(null);
        setUser(me);
        if (pathname !== "/onboarding") {
          api.get<HomeDto>("/home").then((home) => { if (active) setStats(home.stats); }).catch(() => {});
          gameApi.getCurrentRun().then((current) => { if (active) setRun(current); }).catch(() => { if (active) setRun(null); });
        }
      }).catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setAuthError(null);
          verifiedUserId.current = null;
          setUser(null);
          router.replace("/login");
        }
        else setAuthError(error instanceof Error ? error.message : "로그인 상태를 확인할 수 없습니다.");
      }).finally(() => { pending = false; });
    };
    refreshUser();
    window.addEventListener("focus", refreshUser);
    document.addEventListener("visibilitychange", refreshUser);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshUser);
      document.removeEventListener("visibilitychange", refreshUser);
    };
  }, [pathname, onboardingMode, router, authAttempt]);

  if (authError && !user) return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-card border border-line bg-surface p-6 text-center"><h1 className="text-xl font-bold">서비스에 연결할 수 없습니다</h1><p className="mt-2 text-sm text-muted">{authError}</p><Button className="mt-5" onClick={() => setAuthAttempt((attempt) => attempt + 1)}>다시 시도</Button></div></main>;
  if (!user) return <AuthLoading />;
  if (onboardingRedirect(user, pathname, onboardingMode)) return <AuthLoading />;
  if (pathname === "/onboarding") return <CurrentUser.Provider key={user.userId} value={user}>{children}</CurrentUser.Provider>;

  return <CurrentUser.Provider key={user.userId} value={user}><PreferencesEffect /><div className="min-h-screen">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-5 focus:top-3 focus:z-50 focus:bg-accent focus:p-3">본문으로 이동</a>
    <header className="site-header"><div className="site-header-inner">
      <Link href="/" className="brand-mark" aria-label="KUREND 홈" onClick={() => setMenuOpen(false)}>KUREND<svg aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M16 1v30M1 16h30M5.4 5.4l21.2 21.2M5.4 26.6 26.6 5.4" stroke="currentColor" strokeWidth="4" /></svg></Link>
      <nav id="site-navigation" className={clsx("site-nav", menuOpen && "is-open")} aria-label="주 메뉴">{links.map(({ href, label }) => { const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined}>{label}</Link>; })}</nav>
      <HeaderJunior run={run} onNavigate={() => setMenuOpen(false)} />
      <Link href="/mypage" className="site-profile" onClick={() => setMenuOpen(false)} aria-label={`${user.nickname} 마이페이지`} aria-current={pathname === "/mypage" || pathname === "/profile" ? "page" : undefined}>
        <span className="profile-monogram" aria-hidden="true">{user.nickname.slice(0, 1)}</span><span><span className="site-profile-name">{user.nickname} <span aria-hidden="true">↗</span></span><span className="site-profile-caption">완료 {stats?.completedSessions ?? "–"}회 · 평균 {stats?.averageScore ?? "–"}점</span></span>
      </Link>
      <button className="site-menu-button" aria-label="메뉴 열기" aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(!menuOpen)}><span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span></button>
    </div></header>
    {menuOpen && <button className="site-menu-backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />}
    <main id="main-content" className="site-main min-w-0">{authError && <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 border border-line bg-surface p-4 text-sm"><p>{authError} 연결이 복구되면 계속 이용할 수 있어요.</p><Button variant="secondary" onClick={() => setAuthAttempt((attempt) => attempt + 1)}>다시 시도</Button></div>}<div className="page-enter">{children}</div></main>
    <footer className="site-footer"><p><strong>KUREND</strong>가르친 만큼, 함께 성장합니다.</p><span className="editorial-label">Teach. Learn. Grow together.</span></footer>
  </div></CurrentUser.Provider>;
}

function RouteGate({ children, pathname }: { children: ReactNode; pathname: string }) {
  const search = useSearchParams();
  const onboardingMode = pathname === "/onboarding" ? search.get("mode") : null;
  // Keep authenticated state through route changes. /login still unmounts this
  // gate completely, so a subsequent login always loads its own account.
  return <AuthenticatedShell pathname={pathname} onboardingMode={onboardingMode}>{children}</AuthenticatedShell>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  return <Suspense fallback={<AuthLoading />}><RouteGate pathname={pathname}>{children}</RouteGate></Suspense>;
}
