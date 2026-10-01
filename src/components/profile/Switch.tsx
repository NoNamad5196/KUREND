"use client";

import clsx from "clsx";

/** 접근 가능한 토글 스위치 (role="switch"). 이름은 <label htmlFor={id}> 로 붙인다. Space/Enter 는 button 기본 동작. */
export function Switch({ id, checked, onChange, describedBy }: { id: string; checked: boolean; onChange: (next: boolean) => void; describedBy?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className="group relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className={clsx(
          "relative block h-7 w-12 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2",
          checked ? "bg-primary" : "bg-line",
        )}
      >
        <span className={clsx("absolute left-1 top-1 block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
      </span>
    </button>
  );
}
