"use client";
/**
 * 공부하기 — "가르치기 전에 스스로 확인". 강의노트의 후배 예상 질문(노트가 없으면 핵심 포인트)을 체크리스트로 보여준다.
 * 체크 상태는 localStorage `kurend.study.{chapterId}` 에 둔다(저장이 막힌 브라우저에서도 화면은 그대로 동작).
 */
import clsx from "clsx";
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import { useCallback, useEffect, useState } from "react";
import { Card, Spinner } from "@/components/session/ui";

export type CheckItem = { key: string; text: string; hint: string };

const storageKey = (chapterId: string) => `kurend.study.${chapterId}`;

function readChecked(chapterId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(chapterId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeChecked(chapterId: string, keys: string[]) {
  try {
    window.localStorage.setItem(storageKey(chapterId), JSON.stringify(keys));
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 체크한 항목 key 목록(질문 문장 그대로). 노트가 다시 만들어져 문장이 바뀌면 자연히 빠진다. */
export function useStudyChecklist(chapterId: string) {
  const [checked, setChecked] = useState<string[]>([]);
  useEffect(() => {
    setChecked(readChecked(chapterId));
  }, [chapterId]);
  const toggle = useCallback(
    (key: string) => {
      setChecked((prev) => {
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        writeChecked(chapterId, next);
        return next;
      });
    },
    [chapterId],
  );
  return { checked, toggle };
}

/** 예상 질문이 있으면 질문으로, 없으면 핵심 포인트로 체크 항목을 만든다(중복 제거). */
export function checklistItems(questions: string[], points: string[]): CheckItem[] {
  const qs = Array.from(new Set(questions.map((q) => q.trim()).filter(Boolean)));
  if (qs.length) return qs.map((q) => ({ key: q, text: `“${q}”`, hint: "이 질문에 답할 수 있다" }));
  const ps = Array.from(new Set(points.map((p) => p.trim()).filter(Boolean)));
  return ps.map((p) => ({ key: `point:${p}`, text: p, hint: "이 개념을 내 말로 설명할 수 있다" }));
}

export function SelfCheck({
  items,
  checked,
  onToggle,
  loading,
  juniorName,
  className,
}: {
  items: CheckItem[];
  checked: string[];
  onToggle: (key: string) => void;
  /** 강의노트를 아직 만드는 중이면 질문 자리에 안내를 띄운다 */
  loading: boolean;
  juniorName?: string | null;
  className?: string;
}) {
  const total = items.length;
  const ready = items.filter((item) => checked.includes(item.key)).length;
  const allReady = total > 0 && ready === total;
  const pct = total ? Math.round((ready / total) * 100) : 0;
  return (
    <Card className={clsx("p-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="self-check-title" className="text-lg font-bold">
            가르치기 전에 스스로 확인
          </h2>
          <p className="mt-1 text-sm text-muted">후배가 이렇게 물어보면 자료를 보지 않고 내 말로 답할 수 있나요?</p>
        </div>
        {total > 0 && (
          <p className={clsx("shrink-0 text-sm font-bold tabular-nums", allReady ? "text-ok" : "text-primary")}>
            {ready}/{total} 준비됨
          </p>
        )}
      </div>
      {total > 0 && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className={clsx("h-full rounded-full transition-[width] duration-500", allReady ? "bg-ok" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      )}

      {total === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted" role="status">
          {loading ? (
            <>
              <Spinner /> 후배가 물어볼 질문을 정리하는 중…
            </>
          ) : (
            "이 목차에는 확인할 질문이 아직 없어요. 강의노트를 훑어보고 바로 가르쳐 보세요."
          )}
        </p>
      ) : (
        <ul className="mt-4 grid gap-2 md:grid-cols-2" aria-labelledby="self-check-title">
          {items.map((item, i) => {
            const on = checked.includes(item.key);
            const id = `self-check-${i}`;
            return (
              <li key={item.key} className="min-w-0">
                <label
                  htmlFor={id}
                  className={clsx(
                    "flex h-full cursor-pointer items-start gap-3 rounded-sm border px-3 py-3 transition",
                    on ? "border-primary/30 bg-primary-soft" : "border-line bg-surface hover:bg-bg",
                  )}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(item.key)}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-6 [overflow-wrap:anywhere]">{stripMarkdownBold(item.text)}</span>
                    <span className={clsx("mt-0.5 block text-xs", on ? "font-semibold text-primary" : "text-muted")}>{item.hint}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {allReady && (
        <p role="status" className="mt-4 rounded-sm border border-ok/20 bg-[#E6F2E7] px-3 py-2 text-sm font-semibold text-ok">
          모두 준비됐어요! 이제 {juniorName ?? "후배"}에게 가르치러 가 볼까요?
        </p>
      )}
    </Card>
  );
}
