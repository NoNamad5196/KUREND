/**
 * 마이페이지 "업적" 본문 — 배지 미리보기 + 가장 가까운 다음 업적 + /achievements 링크.
 */
import Link from "next/link";
import clsx from "clsx";
import { sortByCloseness, type Achievement } from "@/lib/client/achievements";
import { CATEGORY_TINT } from "@/components/achievements/AchievementItems";
import { ProgressBar } from "@/components/achievements/ProgressBar";

export function AchievementsSummary({ list }: { list: Achievement[] }) {
  const unlocked = list.filter((a) => a.unlocked).length;
  const next = sortByCloseness(list)[0] ?? null;
  return (
    <div>
      <p className="flex items-baseline gap-2 border-b border-ink pb-4"><span className="text-4xl font-semibold tracking-tight text-primary tabular-nums">{unlocked}</span><span className="text-sm text-muted">/ {list.length}개 획득</span></p>
      <ul className="mt-5 flex flex-wrap gap-2" aria-label="업적 배지 미리보기">
        {list.map((a) => (
          <li
            key={a.id}
            title={a.title}
            className={clsx("grid h-10 w-10 place-items-center rounded-full border border-line text-lg leading-none", !a.unlocked && "bg-bg opacity-45 grayscale")}
            style={a.unlocked ? { background: CATEGORY_TINT[a.category].bg } : undefined}
          >
            <span aria-hidden="true">{a.icon}</span>
            <span className="sr-only">{a.title} {a.unlocked ? "획득" : "미획득"}</span>
          </li>
        ))}
      </ul>
      {next ? (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <p className="min-w-0 truncate"><span className="text-muted">다음 업적 · </span><b>{next.title}</b></p>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{next.progress} / {next.goal}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{next.description}</p>
          <ProgressBar value={next.progress} goal={next.goal} label={`${next.title} 진행도`} track="surface" className="mt-3" />
        </div>
      ) : (
        <p className="mt-6 text-sm font-semibold text-primary">모든 업적을 모았어요!</p>
      )}
      <Link href="/achievements" className="archive-account-link mt-8"><span>업적 전체 보기</span><span aria-hidden="true">↗</span></Link>
    </div>
  );
}
