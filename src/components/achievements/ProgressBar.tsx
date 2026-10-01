import clsx from "clsx";
import "./achievements.css";

/** 얇은 진행 막대. track: 놓이는 배경과 대비되는 트랙 색 */
export function ProgressBar({
  value,
  goal,
  label,
  track = "bg",
  tone = "primary",
  className,
}: {
  value: number;
  goal: number;
  label: string;
  track?: "bg" | "surface";
  tone?: "primary" | "accent";
  className?: string;
}) {
  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((value / goal) * 100))) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(value, goal)}
      aria-valuetext={`${Math.min(value, goal)} / ${goal}`}
      className={clsx("h-2 overflow-hidden rounded-full", track === "bg" ? "bg-bg" : "bg-surface", className)}
    >
      <div className={clsx("ach-bar h-full rounded-full", tone === "primary" ? "bg-primary" : "bg-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}
