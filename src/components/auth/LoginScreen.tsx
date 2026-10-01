"use client";
/**
 * KUREND 로그인 화면. Google OAuth 는 서버에 GOOGLE_CLIENT_ID/SECRET 이 있을 때만 활성화(/api/auth/google/status).
 * 지금은 체험 계정(/auth/demo-accounts → /auth/demo-login)으로 로그인한다.
 * TODO(A 머지 후): `@/components/session/_api` → `@/lib/client/api`, `@/components/session/ui` → `@/components/shell/ui`.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { DemoAccountDto } from "@/contracts/types";
import { Mascot } from "@/components/mascot/Mascot";
import { api } from "@/components/session/_api";
import { Card, Chip, Spinner, Toaster, toast } from "@/components/session/ui";
import "./login.css";

const ORBIT = ["수요 법칙", "PCB", "탄력성", "RR 스케줄링", "정상재", "컨텍스트 스위칭"];
const DEMO_HINT: Record<string, string> = { usr_demo1: "자료 2개 · 완료 세션 1개", usr_demo2: "빈 계정에서 시작", usr_demo3: "빈 계정에서 시작" };

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 35.3 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginScreen() {
  const search = useSearchParams();
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    api.get<{ enabled: boolean }>("/auth/google/status").then((r) => setGoogleEnabled(r.enabled)).catch(() => setGoogleEnabled(false));
  }, []);
  useEffect(() => {
    const code = search.get("error");
    if (!code) return;
    const message: Record<string, string> = {
      google_unavailable: "Google 로그인이 아직 설정되지 않았어요. 체험 계정으로 둘러보세요.",
      google_denied: "Google 로그인이 취소됐어요.",
      google_state: "로그인 요청이 만료됐어요. 다시 시도해 주세요.",
      google_failed: "Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
    toast(message[code] ?? "로그인에 실패했어요.", "error");
  }, [search]);
  const router = useRouter();
  const [accounts, setAccounts] = useState<DemoAccountDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DemoAccountDto[]>("/auth/demo-accounts")
      .then(setAccounts)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "체험 계정을 불러오지 못했습니다."));
  }, []);

  async function login(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      await api.post("/auth/demo-login", { userId });
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다. 다시 시도해 주세요.");
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1fr_440px]">
      {/* 아트 패널 */}
      <div
        aria-hidden
        className="relative hidden min-h-[480px] place-items-center overflow-hidden rounded-[28px] lg:grid"
        style={{ background: "radial-gradient(circle at 50% 58%, var(--primary-soft), transparent 66%)" }}
      >
        <div className="kl-orbit">
          {ORBIT.map((w, i) => {
            const deg = (360 / ORBIT.length) * i;
            return (
              <span key={w} style={{ transform: `translate(-50%,-50%) rotate(${deg}deg) translate(165px) rotate(${-deg}deg)` }}>
                <span className="whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted shadow-card">{w}</span>
              </span>
            );
          })}
        </div>
        <div className="kl-mascot relative">
          <div className="kl-float">
            <Mascot state="cheer" size={220} label="환영하는 새내기" />
          </div>
        </div>
        <p className="absolute bottom-3 left-0 right-0 text-center font-hand text-2xl text-primary">가르친 만큼 아는 새내기</p>
      </div>

      {/* 로그인 카드 */}
      <Card className="kl-card space-y-4 p-7 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary text-sm font-black text-primary-ink">K</span>
          <span className="text-xl font-extrabold tracking-tight">KUREND</span>
          <span className="ml-auto lg:hidden">
            <Mascot state="idle" size={56} />
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight [text-wrap:balance]">처음 뵙겠습니다, 선배</h1>
          <p className="mt-2 leading-7 text-muted">가르친 만큼만 아는 새내기가 선배의 설명을 기다리고 있습니다.</p>
        </div>

        {googleEnabled ? (
          <a
            href="/api/auth/google"
            className="flex h-12 w-full items-center gap-3 rounded-sm border border-line bg-surface px-4 text-[15px] font-semibold transition hover:bg-bg focus-visible:outline-2 focus-visible:outline-primary"
          >
            <GoogleMark />
            <span className="whitespace-nowrap">Google로 계속하기</span>
            <span className="ml-auto text-muted" aria-hidden="true">→</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={() => toast(googleEnabled === null ? "잠시만요, 로그인 설정을 확인하는 중이에요." : "Google 로그인이 아직 설정되지 않았어요. 체험 계정으로 둘러보세요.")}
            className="flex h-12 w-full items-center gap-3 rounded-sm border border-line bg-surface px-4 text-[15px] font-semibold transition hover:bg-bg focus-visible:outline-2 focus-visible:outline-primary"
          >
            <GoogleMark />
            <span className="whitespace-nowrap">Google로 계속하기</span>
            <Chip tone="muted" className="ml-auto">
              {googleEnabled === null ? "확인 중" : "준비 중"}
            </Chip>
          </button>
        )}

        <div className="flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
          또는 체험 계정으로 둘러보기
        </div>

        <div className="space-y-2" aria-busy={!accounts && !error}>
          {!accounts && !error && (
            <p className="flex items-center gap-2 py-3 text-sm text-muted" role="status">
              <Spinner /> 체험 계정을 불러오는 중…
            </p>
          )}
          {accounts?.map((a, i) => (
            <button
              key={a.userId}
              type="button"
              disabled={!!busy}
              onClick={() => void login(a.userId)}
              className="kl-demo kurend-rise grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-left hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
              style={{ animationDelay: `${0.25 + i * 0.07}s` }}
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-[13px] font-extrabold text-[#8A5A00]">
                {a.nickname.replace(/\s/g, "").slice(0, 1)}
                {a.nickname.match(/\d+/)?.[0] ?? ""}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{a.nickname}</span>
                <span className="block truncate text-xs text-muted">{DEMO_HINT[a.userId] ?? "체험 계정"}</span>
              </span>
              <span className="kl-go font-extrabold text-primary">{busy === a.userId ? <Spinner /> : "→"}</span>
            </button>
          ))}
          {error && (
            <p className="rounded-sm bg-danger-soft p-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
        <p className="text-xs leading-5 text-muted">{googleEnabled ? <>Google 계정으로 로그인하면 내 자료와 후배 기록이 내 계정에 남습니다. <a href="/privacy.html" className="underline">개인정보 처리방침</a></> : "학교 계정 연동은 곧 열립니다. 지금은 체험 계정으로 모든 기능을 써 볼 수 있어요."}</p>
      </Card>
      <Toaster />
    </main>
  );
}
