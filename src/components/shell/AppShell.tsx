"use client";
/**
 * 앱 셸 — 데스크톱: 왼쪽 사이드바(현재 후배·메뉴·내 기록), 모바일: 위 얇은 바 + 아래 탭바(+ 더보기 시트).
 * 세션 진행·연출 화면(/session/*, /runs/*)에서는 모바일 탭바를 숨겨 입력창·씬을 가리지 않는다.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { api, ApiError } from "@/lib/client/api";
import { gameApi } from "@/lib/client/game-api";
import type { MeDto, HomeDto } from "@/contracts/types";
import type { RunDto } from "@/contracts/game";
import { LifeHearts } from "@/components/game/LifeHearts";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { Button } from "./ui";
import { NavIcon, type NavIconName } from "./NavIcon";
import { SidebarJunior } from "./SidebarJunior";
import { Onboarding } from "@/components/onboarding/Onboarding";

type NavLink = { href: string; label: string; icon: NavIconName };
const MAIN: NavLink[] = [
  { href: "/", label: "홈", icon: "home" },
  { href: "/new", label: "새 자료", icon: "plus" },
  { href: "/sessions", label: "내 세션", icon: "sessions" },
  { href: "/wrong-notes", label: "오답노트", icon: "notes" },
];
const MORE: NavLink[] = [
  { href: "/album", label: "졸업앨범", icon: "album" },
  { href: "/map", label: "지식 지도", icon: "map" },
  { href: "/achievements", label: "업적", icon: "trophy" },
  { href: "/profile", label: "프로필·설정", icon: "user" },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const immersive = pathname.startsWith("/session/") || pathname.startsWith("/runs/");
  const [user, setUser] = useState<MeDto | null>(null);
  const [stats, setStats] = useState<HomeDto["stats"] | null>(null);
  const [run, setRun] = useState<RunDto | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // 로그인 확인은 한 번, 통계·현재 후배는 화면을 옮길 때마다 가볍게 새로 읽는다(LIFE·진행도 반영).
  useEffect(() => {
    if (isLogin) return;
    let active = true;
    api.get<MeDto>("/auth/me").then((me) => { if (active) { setUser(me); setReady(true); } }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else { setAuthError(error instanceof Error ? error.message : "로그인 상태를 확인할 수 없습니다."); setReady(true); }
    });
    return () => { active = false; };
  }, [isLogin, router]);

  const refresh = useCallback(() => {
    api.get<HomeDto>("/home").then((home) => setStats(home.stats)).catch(() => {});
    gameApi.getCurrentRun().then(setRun).catch(() => setRun(null));
  }, []);
  useEffect(() => { if (!isLogin && ready && !authError) refresh(); }, [isLogin, ready, authError, pathname, refresh]);
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  if (isLogin) return <>{children}</>;
  if (!ready) return <div className="grid min-h-screen place-items-center text-muted" role="status">로그인 상태를 확인하는 중…</div>;
  if (authError) return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-card border border-line bg-surface p-6 text-center"><h1 className="text-xl font-bold">서비스에 연결할 수 없습니다</h1><p className="mt-2 text-sm text-muted">{authError}</p><Button className="mt-5" onClick={() => window.location.reload()}>다시 시도</Button></div></main>;

  async function logout() {
    try { await api.post("/auth/logout"); } finally { router.replace("/login"); router.refresh(); }
  }
  const nickname = user?.nickname ?? "선배";

  return <div className="min-h-screen lg:flex">
    {/* ── 모바일 상단 바 ── */}
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
      <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight text-primary"><span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-xs text-primary-ink">K</span>새내기</Link>
      {run ? <Link href={`/materials/${run.materialId}`} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2.5" aria-label="지금 가르치는 후배">
        <JuniorAvatar character={run.character} size={28} pose="still" />
        <LifeHearts lives={run.lives} maxLives={run.maxLives} size={13} />
      </Link> : <Link href="/profile" className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary" aria-label="프로필">{nickname.slice(0, 1)}</Link>}
    </header>

    {/* ── 데스크톱 사이드바 ── */}
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 border-r border-line bg-surface px-4 py-6 lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary text-sm font-black text-primary-ink">K</span>
        <span><span className="block text-xl font-black leading-tight tracking-tight text-primary">새내기</span><span className="block text-[10px] font-bold tracking-[0.2em] text-muted">KUREND</span></span>
      </Link>
      <div>
        <p className="mb-1.5 px-2 text-[11px] font-bold text-muted">지금 가르치는 후배</p>
        <SidebarJunior run={run} />
      </div>
      <nav className="space-y-0.5" aria-label="주 메뉴">
        {[...MAIN, ...MORE.slice(0, 3)].map(({ href, label, icon }) => {
          const active = isActive(pathname, href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition", active ? "bg-primary-soft text-primary" : "text-ink hover:bg-bg")}>
            <NavIcon name={icon} className={clsx("h-[18px] w-[18px]", active ? "text-primary" : "text-muted")} />{label}
          </Link>;
        })}
      </nav>
      <div className="mt-auto rounded-card border border-line bg-bg/70 p-3">
        <Link href="/profile" className="flex items-center gap-2.5 rounded-lg hover:opacity-80">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-black text-primary-ink">{nickname.slice(0, 1)}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-bold">{nickname}</span><span className="block text-[11px] text-muted">프로필·설정</span></span>
        </Link>
        <dl className="mt-3 grid grid-cols-3 gap-1 text-center">
          <div><dt className="text-[10px] text-muted">연속</dt><dd className="text-sm font-black tabular-nums text-primary">{stats?.streakDays ?? "–"}<span className="text-[10px] font-semibold text-muted">일</span></dd></div>
          <div><dt className="text-[10px] text-muted">완료</dt><dd className="text-sm font-black tabular-nums text-primary">{stats?.completedSessions ?? "–"}<span className="text-[10px] font-semibold text-muted">회</span></dd></div>
          <div><dt className="text-[10px] text-muted">평균</dt><dd className="text-sm font-black tabular-nums text-primary">{stats?.averageScore ?? "–"}<span className="text-[10px] font-semibold text-muted">점</span></dd></div>
        </dl>
        <button className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink" onClick={logout}><NavIcon name="logout" className="h-3.5 w-3.5" />로그아웃</button>
      </div>
    </aside>

    <main className={clsx("min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-10", !immersive && "pb-28 lg:pb-10")}><div className="mx-auto max-w-6xl">{children}</div></main>

    {/* ── 모바일 하단 탭바 ── */}
    {!immersive && <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="하단 메뉴">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {MAIN.map(({ href, label, icon }) => {
          const active = isActive(pathname, href);
          return <li key={href}><Link href={href} aria-current={active ? "page" : undefined} className={clsx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-primary" : "text-muted")}>
            <span className={clsx("grid h-7 w-12 place-items-center rounded-full transition", active && "bg-primary-soft")}><NavIcon name={icon} className="h-5 w-5" /></span>{label}
          </Link></li>;
        })}
        <li><button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className={clsx("flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", MORE.some((l) => isActive(pathname, l.href)) ? "text-primary" : "text-muted")}>
          <span className="grid h-7 w-12 place-items-center rounded-full"><NavIcon name="more" className="h-5 w-5" /></span>더보기
        </button></li>
      </ul>
    </nav>}
    <Onboarding />
    {moreOpen && <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="더보기 메뉴">
      <button className="absolute inset-0 bg-ink/40" aria-label="닫기" onClick={() => setMoreOpen(false)} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[22px] bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl">
        <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        <SidebarJunior run={run} onNavigate={() => setMoreOpen(false)} />
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {MORE.map(({ href, label, icon }) => <li key={href}><Link href={href} className={clsx("flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold", isActive(pathname, href) ? "bg-primary-soft text-primary" : "bg-bg text-ink")}><NavIcon name={icon} />{label}</Link></li>)}
        </ul>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-bg px-3 py-2.5 text-xs">
          <span className="font-semibold">{nickname} · 연속 {stats?.streakDays ?? 0}일 · 완료 {stats?.completedSessions ?? 0}회</span>
          <button className="font-semibold text-muted underline" onClick={logout}>로그아웃</button>
        </div>
      </div>
    </div>}
  </div>;
}
