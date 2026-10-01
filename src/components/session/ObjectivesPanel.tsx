/**
 * 학습 목표(달성 체크) + 새내기가 들은 개념 칩. 사용자가 뭘 더 가르쳐야 하는지 바로 보이게 한다.
 */
import clsx from "clsx";
import type { ObjectiveDto } from "@/contracts/types";
import { Card, Chip } from "./ui";

export function ObjectivesPanel({
  objectives,
  covered,
  heardConcepts,
  className,
}: {
  objectives: ObjectiveDto[];
  covered: string[];
  heardConcepts: string[];
  className?: string;
  collapsible?: boolean;
}) {
  const done = objectives.filter((o) => covered.includes(o.id)).length;
  return (
    <Card className={clsx("grid gap-7 border-0 bg-transparent px-0 py-1 sm:grid-cols-[1.2fr_1fr] sm:gap-10", className)}>
      <section className="min-w-0">
        <h2 className="flex items-center justify-between gap-4 border-b border-line pb-3 text-sm font-semibold">
          학습 목표
          <span className="text-xs font-medium tabular-nums text-muted">
            {done} / {objectives.length}
          </span>
        </h2>
        <ol className="mt-4 space-y-4">
          {objectives.map((o) => {
            const ok = covered.includes(o.id);
            return (
              <li key={o.id} className="grid grid-cols-[20px_1fr] items-start gap-2 text-sm">
                <span
                  aria-hidden
                  className={clsx(
                    "mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-sm border text-[11px] font-bold transition-colors duration-300",
                    ok ? "border-primary bg-primary text-primary-ink" : "border-line",
                  )}
                >
                  {ok ? "✓" : ""}
                </span>
                <span className={clsx(ok ? "text-ink" : "text-ink/80")}>
                  {o.text}
                  {ok && (
                    <Chip tone="ok" className="kurend-pop ml-1.5 align-middle">
                      달성
                    </Chip>
                  )}
                  <span className="sr-only">{ok ? " (달성)" : " (아직)"}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="min-w-0">
        <h2 className="flex items-center justify-between gap-4 border-b border-line pb-3 text-sm font-semibold">
          새내기가 들은 개념
          <span className="text-xs font-medium tabular-nums text-muted">{heardConcepts.length}</span>
        </h2>
        <div className="mt-4 flex flex-wrap gap-2" aria-live="polite">
          {heardConcepts.length === 0 ? (
            <span className="text-xs text-muted">아직 들은 개념이 없어요</span>
          ) : (
            heardConcepts.map((c) => (
              <Chip key={c} className="kurend-pop">
                {c}
              </Chip>
            ))
          )}
        </div>
      </section>
    </Card>
  );
}
