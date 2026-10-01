"use client";
/**
 * 프로필·설정 — 선배 정보 + 학습 통계 + 함께하는 후배 + 업적 요약 + 환경설정 + 개인정보 + 로그아웃
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { computeAchievements } from "@/lib/client/achievements";
import type { MeDto } from "@/contracts/types";
import { Button, Card } from "@/components/shell/ui";
import { useAchievementInputs } from "@/components/achievements/useAchievementInputs";
import { AchievementsSummary } from "./AchievementsSummary";
import { CurrentJuniorCard } from "./CurrentJuniorCard";
import { SettingsPanel } from "./SettingsPanel";

function Stat({ label, value, unit }: { label: string; value: number | string; unit: string }) {
  return (
    <div className="rounded-2xl bg-bg px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{value}<span className="ml-0.5 text-sm">{unit}</span></p>
    </div>
  );
}

export function ProfilePage() {
  const [me, setMe] = useState<MeDto | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const { data, error, reload } = useAchievementInputs("프로필을 불러오지 못했어요.");
  const achievements = useMemo(() => (data ? computeAchievements(data) : null), [data]);

  useEffect(() => {
    let active = true;
    api.get<MeDto>("/auth/me").then((value) => { if (active) setMe(value); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await api.post("/auth/logout");
    } catch {
      /* 실패해도 로그인 화면으로 보낸다 */
    } finally {
      window.location.href = "/login";
    }
  }

  const nickname = me?.nickname || data?.home.userName || "";
  const initial = Array.from(nickname.trim())[0] ?? "선";

  return (
    <>
      <Card className="relative mb-6 overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-primary-soft" />
        <div className="relative flex items-center gap-4">
          <span aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary text-2xl font-black text-primary-ink">{initial}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted">프로필</p>
            <h1 className="truncate text-2xl font-bold tracking-tight">{nickname ? `${nickname} 선배` : "선배"}</h1>
            <p className="mt-0.5 text-sm text-muted">가르친 만큼 후배가 자라요.</p>
          </div>
        </div>
        {data ? (
          <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="연속 학습" value={me?.streakDays ?? data.home.stats.streakDays} unit="일" />
            <Stat label="완료한 수업" value={data.home.stats.completedSessions} unit="회" />
            <Stat label="평균 점수" value={data.home.stats.averageScore ?? "–"} unit="점" />
            <Stat label="졸업시킨 후배" value={data.album.graduated.length} unit="명" />
          </div>
        ) : error ? (
          <p role="alert" className="relative mt-5 text-sm text-danger">
            {error}
            <button className="ml-2 font-semibold underline" onClick={reload}>다시 시도</button>
          </p>
        ) : (
          <p role="status" className="relative mt-5 text-sm text-muted">기록을 불러오는 중…</p>
        )}
      </Card>

      {data && achievements && (
        <div className="mb-8 grid gap-5 lg:grid-cols-2">
          <section aria-label="함께하는 후배"><CurrentJuniorCard run={data.run} /></section>
          <section aria-label="업적 요약"><AchievementsSummary list={achievements} /></section>
        </div>
      )}

      <div className="space-y-8">
        <SettingsPanel />

        <section aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="mb-3 text-lg font-bold">데이터와 개인정보</h2>
          <Card>
            <p className="text-sm leading-relaxed">올린 자료와 학습 기록은 내 계정에만 저장돼요. 후배의 대화와 채점을 위해 자료 일부가 AI 서비스로 전송될 수 있어요.</p>
            <p className="mt-2 text-sm text-muted">기록 삭제를 원하면 개인정보처리방침의 문의처로 요청해 주세요.</p>
            <a href="/privacy.html" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-primary hover:underline">개인정보처리방침 보기 →</a>
          </Card>
        </section>

        <section aria-label="계정" className="pb-4">
          <Button variant="danger" className="w-full sm:w-auto" loading={loggingOut} onClick={logout}>로그아웃</Button>
        </section>
      </div>
    </>
  );
}
