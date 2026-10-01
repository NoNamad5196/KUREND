import clsx from "clsx";
import { sortByCloseness, type Achievement } from "@/lib/client/achievements";
import { CATEGORY_TINT } from "@/components/achievements/AchievementItems";
import { ProgressBar } from "@/components/achievements/ProgressBar";
import { Card } from "@/components/shell/ui";
import { ButtonLink } from "./ButtonLink";

/** 프로필의 업적 요약: 배지 미리보기 + 다음 업적 + /achievements 링크 */
export function AchievementsSummary({ list }: { list: Achievement[] }) {
  const unlocked = list.filter((a) => a.unlocked).length;
  const next = sortByCloseness(list)[0] ?? null;
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">업적</h2>
        <span className="text-sm font-bold tabular-nums text-primary">{unlocked} / {list.length}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="업적 배지 미리보기">
        {list.map((a) => (
          <li
            key={a.id}
            title={a.title}
            className={clsx("grid h-9 w-9 place-items-center rounded-full text-lg leading-none", !a.unlocked && "bg-bg opacity-50 grayscale")}
            style={a.unlocked ? { background: CATEGORY_TINT[a.category].bg } : undefined}
          >
            <span aria-hidden="true">{a.icon}</span>
            <span className="sr-only">{a.title} {a.unlocked ? "획득" : "미획득"}</span>
          </li>
        ))}
      </ul>
      {next ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <p className="min-w-0 truncate"><span className="text-muted">다음 업적 · </span><b>{next.title}</b></p>
            <span className="shrink-0 text-xs font-bold tabular-nums text-muted">{next.progress} / {next.goal}</span>
          </div>
          <ProgressBar value={next.progress} goal={next.goal} label={`${next.title} 진행도`} className="mt-2" />
        </div>
      ) : (
        <p className="mt-4 text-sm font-semibold text-primary">모든 업적을 모았어요! 🎉</p>
      )}
      <div className="mt-auto pt-4">
        <ButtonLink href="/achievements" variant="secondary" className="w-full">업적 보기 →</ButtonLink>
      </div>
    </Card>
  );
}
