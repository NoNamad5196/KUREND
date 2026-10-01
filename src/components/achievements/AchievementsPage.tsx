"use client";
/**
 * 업적 — 시험·완주·졸업 기록으로만 열린다. 계산은 lib/client/achievements.ts (새 API 없음)
 */
import { useMemo } from "react";
import { computeAchievements, sortByCloseness, type Achievement } from "@/lib/client/achievements";
import type { JuniorCharacter } from "@/contracts/game";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { Card } from "@/components/shell/ui";
import { ButtonLink } from "@/components/profile/ButtonLink";
import { LockedRow, UnlockedBadge } from "./AchievementItems";
import { ProgressBar } from "./ProgressBar";
import { useAchievementInputs } from "./useAchievementInputs";

function Hero({ list, character }: { list: Achievement[]; character: JuniorCharacter }) {
  const unlocked = list.filter((a) => a.unlocked).length;
  const next = sortByCloseness(list)[0] ?? null;
  return (
    <Card className="relative mb-8 overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-accent-soft" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">업적</h1>
            <p className="mt-1 text-sm text-muted">시험·완주·졸업으로만 열립니다</p>
            <p className="mt-5 text-xs font-semibold text-muted">모은 업적</p>
            <p className="mt-0.5 text-4xl font-black tabular-nums text-primary">
              {unlocked}
              <span className="ml-1 text-xl font-bold text-muted">/ {list.length}</span>
            </p>
          </div>
          <JuniorAvatar character={character} mood="happy" size={124} className="-mb-2 shrink-0" />
        </div>
        <ProgressBar value={unlocked} goal={list.length} label="전체 업적 진행도" tone="accent" className="mt-4" />
        {next ? (
          <div className="mt-5 rounded-2xl bg-bg p-4">
            <p className="text-xs font-bold text-primary">다음 업적까지</p>
            <div className="mt-2 flex items-center gap-3">
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-2xl leading-none">{next.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{next.title}</p>
                <p className="text-xs text-muted">{next.unlockedHint}</p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums">{next.progress} / {next.goal}</span>
            </div>
            <ProgressBar value={next.progress} goal={next.goal} label={`${next.title} 진행도`} track="surface" className="mt-3" />
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-primary-soft p-4 text-sm font-bold text-primary">모든 업적을 모았어요! 최고의 선배예요 🎉</p>
        )}
      </div>
    </Card>
  );
}

export function AchievementsPage() {
  const { data, error, reload } = useAchievementInputs("업적을 불러오지 못했어요.");
  const list = useMemo(() => (data ? computeAchievements(data) : null), [data]);
  const unlocked = list?.filter((a) => a.unlocked) ?? [];
  const locked = list ? sortByCloseness(list) : [];

  if (error) {
    return (
      <Card role="alert" className="border-danger text-danger">
        {error}
        <button className="ml-2 font-semibold underline" onClick={reload}>다시 시도</button>
      </Card>
    );
  }
  if (!data || !list) return <p className="py-20 text-center text-muted" role="status">업적을 확인하는 중…</p>;

  return (
    <>
      <Hero list={list} character={data.run?.character ?? "KU_HARD"} />
      {data.partial && <p role="status" className="-mt-5 mb-6 text-xs text-warn">일부 기록을 불러오지 못해 실제보다 적게 보일 수 있어요.</p>}

      <section aria-labelledby="ach-unlocked" className="mb-10">
        <h2 id="ach-unlocked" className="mb-4 text-lg font-bold">모은 업적 <span className="text-primary">{unlocked.length}</span></h2>
        {unlocked.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {unlocked.map((a, i) => <UnlockedBadge key={a.id} achievement={a} index={i} />)}
          </ul>
        ) : (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-bg text-3xl opacity-60 grayscale">📖</span>
            <p className="font-bold">아직 모은 업적이 없어요</p>
            <p className="max-w-xs text-sm text-muted">첫 수업을 끝까지 마치면 첫 배지가 열려요.</p>
            <ButtonLink href="/">가르치러 가기</ButtonLink>
          </Card>
        )}
      </section>

      <section aria-labelledby="ach-locked">
        <h2 id="ach-locked" className="mb-1 text-lg font-bold">남은 업적 <span className="text-muted">{locked.length}</span></h2>
        <p className="mb-4 text-sm text-muted">거의 다 온 순서예요.</p>
        {locked.length ? (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-card">
            {locked.map((a) => <LockedRow key={a.id} achievement={a} />)}
          </ul>
        ) : (
          <Card className="text-center text-sm font-semibold text-primary">남은 업적이 없어요. 전부 모았어요!</Card>
        )}
      </section>
    </>
  );
}
