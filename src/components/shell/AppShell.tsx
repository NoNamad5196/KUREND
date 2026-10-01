"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { api, ApiError } from "@/lib/client/api";
import type { MeDto, HomeDto } from "@/contracts/types";
import { Button } from "./ui";

const links = [
  { href: "/", label: "홈", icon: "⌂" },
  { href: "/new", label: "새 자료", icon: "＋" },
  { href: "/sessions", label: "내 세션", icon: "◷" },
  { href: "/wrong-notes", label: "오답노트", icon: "✎" },
  { href: "/album", label: "졸업앨범", icon: "🎓" },
  { href: "/map", label: "지식 지도", icon: "◈" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [user, setUser] = useState<MeDto | null>(null);
  const [stats, setStats] = useState<HomeDto["stats"] | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isLogin) return;
    let active = true;
    api.get<MeDto>("/auth/me").then((me) => {
      if (!active) return;
      setUser(me);
      setReady(true);
      api.get<HomeDto>("/home").then((home) => { if (active) setStats(home.stats); }).catch(() => {});
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else { setAuthError(error instanceof Error ? error.message : "로그인 상태를 확인할 수 없습니다."); setReady(true); }
    });
    return () => { active = false; };
  }, [isLogin, pathname, router]);

  if (isLogin) return <>{children}</>;
  if (!ready) return <div className="grid min-h-screen place-items-center text-muted" role="status">로그인 상태를 확인하는 중…</div>;
  if (authError) return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-card border border-line bg-surface p-6 text-center"><h1 className="text-xl font-bold">서비스에 연결할 수 없습니다</h1><p className="mt-2 text-sm text-muted">{authError}</p><Button className="mt-5" onClick={() => window.location.reload()}>다시 시도</Button></div></main>;

  async function logout() {
    try { await api.post("/auth/logout"); } finally { router.replace("/login"); router.refresh(); }
  }

  return <div className="min-h-screen lg:flex">
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-5 py-3 lg:hidden"><Link href="/" className="text-xl font-black tracking-tight text-primary">새내기<span className="ml-1 text-xs font-medium text-muted">KUREND</span></Link><button className="rounded-lg border border-line px-3 py-2" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button></header>
    {menuOpen && <button className="fixed inset-0 z-30 bg-ink/30 lg:hidden" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />}
    <aside className={clsx("fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface px-4 py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0", menuOpen ? "translate-x-0" : "-translate-x-full")}>
      <Link href="/" className="px-3 text-2xl font-black tracking-tight text-primary" onClick={() => setMenuOpen(false)}>새내기<span className="ml-2 align-middle text-xs font-semibold tracking-normal text-muted">KUREND</span></Link>
      <p className="mt-2 px-3 text-xs leading-5 text-muted">가르친 만큼만 아는 AI에게<br />내 지식을 설명해 보세요.</p>
      <nav className="mt-9 space-y-1" aria-label="주 메뉴">{links.map(({ href, label, icon }) => { const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} className={clsx("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold", active ? "bg-primary-soft text-primary" : "text-ink hover:bg-bg")}><span className="w-5 text-center text-lg" aria-hidden="true">{icon}</span>{label}</Link>; })}</nav>
      <div className="mt-auto rounded-card bg-bg p-3"><p className="font-semibold">{user?.nickname ?? "선배"}</p><p className="mt-1 text-xs text-muted">완료 {stats?.completedSessions ?? "–"}회 · 평균 {stats?.averageScore ?? "–"}점</p><button className="mt-3 text-xs font-semibold text-muted underline hover:text-ink" onClick={logout}>로그아웃</button></div>
    </aside>
    <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="mx-auto max-w-6xl">{children}</div></main>
  </div>;
}
