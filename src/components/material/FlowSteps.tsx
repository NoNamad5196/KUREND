/**
 * 큰 흐름 4단계 표시 — 자료 등록 → 목차 확인 → 공부하기 → 가르치기 (원본 서비스의 상단 스테퍼).
 * current: 1~4. 지난 단계는 체크, 현재 단계는 강조.
 */
import clsx from "clsx";

const STEPS = [
  { label: "자료 등록", icon: "📄" },
  { label: "목차 확인", icon: "🗂" },
  { label: "공부하기", icon: "📖" },
  { label: "가르치기", icon: "💬" },
] as const;

export function FlowSteps({ current, className }: { current: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <ol className={clsx("mb-6 flex items-center gap-1 overflow-x-auto pb-1 text-xs sm:gap-2", className)} aria-label="학습 흐름">
      {STEPS.map((step, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "todo";
        return (
          <li key={step.label} className="flex shrink-0 items-center gap-1 sm:gap-2">
            <span aria-current={state === "now" ? "step" : undefined} className={clsx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition", state === "now" && "border-primary bg-primary text-primary-ink shadow-card", state === "done" && "border-primary/30 bg-primary-soft text-primary", state === "todo" && "border-line bg-surface text-muted")}>
              <span aria-hidden="true">{state === "done" ? "✓" : step.icon}</span>{step.label}
            </span>
            {i < STEPS.length - 1 && <span className={clsx("h-px w-4 sm:w-8", n < current ? "bg-primary/50" : "bg-line")} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
