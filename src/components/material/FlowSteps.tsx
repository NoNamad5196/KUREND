/**
 * 큰 흐름 4단계 표시 — 자료 등록 → 목차 확인 → 공부하기 → 가르치기 (원본 서비스의 상단 스테퍼).
 * current: 1~4. 지난 단계는 진하게, 현재 단계는 위쪽 굵은 선으로 강조한다.
 */
import clsx from "clsx";

const STEPS = ["자료 등록", "목차 확인", "공부하기", "가르치기"] as const;

export function FlowSteps({ current, className }: { current: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <ol className={clsx("flow-steps", className)} aria-label="학습 흐름">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "todo";
        return (
          <li key={label} data-state={state} aria-current={state === "now" ? "step" : undefined}>
            <span className="flow-step-num" aria-hidden="true">{state === "done" ? "✓" : String(n).padStart(2, "0")}</span>
            {label}
            {state === "done" && <span className="sr-only"> (완료)</span>}
          </li>
        );
      })}
    </ol>
  );
}
