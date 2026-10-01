import type { CSSProperties } from "react";
import type { Achievement, AchievementCategory } from "@/lib/client/achievements";
import { ProgressBar } from "./ProgressBar";
import "./achievements.css";

export const CATEGORY_TINT: Record<AchievementCategory, { bg: string; ink: string; label: string }> = {
  lesson: { bg: "#E3F1EC", ink: "#1F6F5B", label: "수업" },
  exam: { bg: "#FFF4D6", ink: "#9A6400", label: "시험" },
  streak: { bg: "#FDE7DD", ink: "#B4501F", label: "꾸준함" },
  graduation: { bg: "#E6EEF9", ink: "#2F5A99", label: "졸업" },
  notes: { bg: "#F0E9FA", ink: "#6A479F", label: "오답노트" },
};

/** 모은 업적 배지 (마운트 시 pop) */
export function UnlockedBadge({ achievement, index }: { achievement: Achievement; index: number }) {
  const tint = CATEGORY_TINT[achievement.category];
  return (
    <li className="ach-pop list-none" style={{ "--ach-delay": `${Math.min(index, 12) * 60}ms` } as CSSProperties}>
      <div className="flex h-full flex-col items-center rounded-card border border-line bg-surface px-3 py-4 text-center shadow-card">
        <span
          aria-hidden="true"
          className="ach-medal grid h-16 w-16 place-items-center rounded-full text-3xl leading-none"
          style={{ background: tint.bg, border: `3px solid ${tint.ink}33` }}
        >
          {achievement.icon}
        </span>
        <p className="mt-3 text-sm font-bold leading-snug">{achievement.title}</p>
        <p className="mt-1 text-xs leading-snug text-muted">{achievement.description}</p>
        <span className="mt-auto pt-3">
          <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint.bg, color: tint.ink }}>{tint.label}</span>
        </span>
      </div>
    </li>
  );
}

/** 남은 업적 한 줄 */
export function LockedRow({ achievement }: { achievement: Achievement }) {
  const { icon, title, description, unlockedHint, progress, goal } = achievement;
  return (
    <li className="flex items-start gap-3 px-4 py-4 sm:px-5">
      <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-bg text-2xl leading-none opacity-60 grayscale">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold">{title}</p>
          <span className="shrink-0 text-xs font-bold tabular-nums text-muted">{progress} / {goal}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
        <ProgressBar value={progress} goal={goal} label={`${title} 진행도`} className="mt-2" />
        <p className="mt-1.5 text-[11px] text-muted">💡 {unlockedHint}</p>
      </div>
    </li>
  );
}
