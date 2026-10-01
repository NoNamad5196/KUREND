"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/session/ui";

export type ExamViewSettings = { showThought: boolean; instant: boolean; autoAdvance: boolean };
const DEFAULTS: ExamViewSettings = { showThought: true, instant: false, autoAdvance: true };
const KEY = "kurend.examView";

function readSettings(): ExamViewSettings {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const value = raw as Record<string, unknown>;
    return {
      showThought: typeof value.showThought === "boolean" ? value.showThought : true,
      instant: typeof value.instant === "boolean" ? value.instant : false,
      autoAdvance: typeof value.autoAdvance === "boolean" ? value.autoAdvance : true,
    };
  } catch { return DEFAULTS; }
}

export function useExamViewSettings(): [ExamViewSettings, (patch: Partial<ExamViewSettings>) => void] {
  const [settings, setSettings] = useState(DEFAULTS);
  const current = useRef(DEFAULTS);
  useEffect(() => {
    const sync = () => { current.current = readSettings(); setSettings(current.current); };
    sync();
    const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) sync(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const update = useCallback((patch: Partial<ExamViewSettings>) => {
    current.current = { ...current.current, ...patch };
    setSettings(current.current);
    try { window.localStorage.setItem(KEY, JSON.stringify(current.current)); } catch { /* 저장 불가 시 이번 화면에서 유지 */ }
  }, []);
  return [settings, update];
}

export function ViewSettingsMenu({ value, onChange, className }: { value: ExamViewSettings; onChange: (patch: Partial<ExamViewSettings>) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className={clsx("relative ml-auto", className)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Button variant="secondary" className="min-h-11" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>보기 설정 ▾</Button>
    {open && <fieldset id={id} className="absolute right-0 z-20 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-sm border border-ink/20 bg-surface p-3">
      <legend className="sr-only">시험 보기 설정</legend>
      {([["showThought", "속마음 보기"], ["instant", "한 번에 보기"], ["autoAdvance", "자동 진행"]] as const).map(([key, label]) => (
        <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm hover:bg-bg">
          <input type="checkbox" checked={value[key]} onChange={(event) => onChange({ [key]: event.target.checked })} className="h-4 w-4 accent-primary" />{label}
        </label>
      ))}
    </fieldset>}
  </div>;
}
