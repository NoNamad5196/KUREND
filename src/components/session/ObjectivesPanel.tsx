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
    <Card className={clsx("space-y-4 px-4 py-4", className)}>
      <section>
        <h2 className="flex items-center justify-between text-sm font-bold">
          학습 목표
          <span className="text-xs font-medium tabular-nums text-muted">
            {done} / {objectives.length}
          </span>
        </h2>
        <ol className="mt-3 space-y-2.5">
          {objectives.map((o) => {
            const ok = covered.includes(o.id);
            return (
              <li key={o.id} className="grid grid-cols-[20px_1fr] items-start gap-2 text-sm">
                <span
                  aria-hidden
                  className={clsx(
                    "mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 text-[11px] font-bold transition-all duration-300",
                    ok ? "scale-110 border-ok bg-ok text-white" : "border-line",
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
      <section>
        <h2 className="flex items-center justify-between text-sm font-bold">
          새내기가 들은 개념
          <span className="text-xs font-medium tabular-nums text-muted">{heardConcepts.length}</span>
        </h2>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-live="polite">
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
