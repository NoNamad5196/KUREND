"use client";
/**
 * 업적 — 시험·완주·졸업 기록으로만 열린다. 계산은 lib/client/achievements.ts (새 API 없음)
 */
import { useMemo } from "react";
import { computeAchievements, sortByCloseness, type Achievement } from "@/lib/client/achievements";
import type { JuniorCharacter } from "@/contracts/game";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { Card, PageHeader } from "@/components/shell/ui";
import { ButtonLink } from "@/components/profile/ButtonLink";
import { LockedRow, UnlockedBadge } from "./AchievementItems";
import { ProgressBar } from "./ProgressBar";
import { useAchievementInputs } from "./useAchievementInputs";

function Hero({ list, character }: { list: Achievement[]; character: JuniorCharacter }) {
  const unlocked = list.filter((a) => a.unlocked).length;
  const next = sortByCloseness(list)[0] ?? null;
  return (
    <>
      <PageHeader eyebrow="MILESTONES / ACHIEVEMENTS" title="업적" description="시험·완주·졸업 기록으로만 열려요. 가르친 만큼 배지가 쌓입니다." />
      <section className="mb-12 grid items-end gap-8 border-b border-ink pb-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]" aria-label="업적 진행">
        <div>
          <p className="editorial-label text-muted">COLLECTED</p>
          <p className="mt-3 text-6xl font-semibold tracking-tighter text-primary tabular-nums">{unlocked}<span className="ml-2 text-xl font-medium tracking-normal text-muted">/ {list.length}</span></p>
          <ProgressBar value={unlocked} goal={list.length} label="전체 업적 진행도" tone="accent" track="surface" className="mt-5" />
        </div>
        {next ? (
          <div className="min-w-0 border-l-2 border-primary pl-5">
            <p className="editorial-label text-muted">NEXT MILESTONE</p>
            <div className="mt-3 flex items-center gap-3">
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-2xl leading-none">{next.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{next.title}</p>
                <p className="text-xs leading-5 text-muted">{next.unlockedHint}</p>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{next.progress} / {next.goal}</span>
            </div>
            <ProgressBar value={next.progress} goal={next.goal} label={`${next.title} 진행도`} track="surface" className="mt-3" />
          </div>
        ) : (
          <p className="border-l-2 border-primary pl-5 text-sm font-semibold text-primary">모든 업적을 모았어요! 최고의 선배예요.</p>
        )}
        <JuniorAvatar character={character} mood="happy" size={132} className="hidden shrink-0 md:block" />
      </section>
    </>
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
      {data.partial && <p role="status" className="-mt-8 mb-8 text-xs text-warn">일부 기록을 불러오지 못해 실제보다 적게 보일 수 있어요.</p>}

      <section aria-labelledby="ach-unlocked" className="mb-10">
        <p className="editorial-label mb-2 text-muted">01 / COLLECTED</p>
        <h2 id="ach-unlocked" className="mb-5 text-2xl font-semibold tracking-tight">모은 업적 <span className="text-primary">{unlocked.length}</span></h2>
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
        <p className="editorial-label mb-2 text-muted">02 / STILL AHEAD</p>
        <h2 id="ach-locked" className="text-2xl font-semibold tracking-tight">남은 업적 <span className="text-muted">{locked.length}</span></h2>
        <p className="mb-5 mt-1 text-sm text-muted">거의 다 온 순서예요.</p>
        {locked.length ? (
          <ul className="divide-y divide-line border-y border-ink">
            {locked.map((a) => <LockedRow key={a.id} achievement={a} />)}
          </ul>
        ) : (
          <Card className="text-center text-sm font-semibold text-primary">남은 업적이 없어요. 전부 모았어요!</Card>
        )}
      </section>
    </>
  );
}
