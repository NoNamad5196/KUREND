"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-card border border-line bg-surface p-5 shadow-card", className)} {...props}>{children}</div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean };
export function Button({ variant = "primary", loading, className, children, disabled, ...props }: ButtonProps) {
  return <button className={clsx("inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50", {
    "bg-primary text-primary-ink hover:bg-[#185b4b]": variant === "primary",
    "border border-line bg-surface text-ink hover:bg-bg": variant === "secondary",
    "text-primary hover:bg-primary-soft": variant === "ghost",
    "bg-danger-soft text-danger hover:bg-[#f5d8d4]": variant === "danger",
  }, className)} disabled={disabled || loading} {...props}>{loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}{children}</button>;
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "green" | "yellow" | "red"; className?: string }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", {
    "bg-bg text-muted": tone === "neutral", "bg-primary-soft text-primary": tone === "green",
    "bg-accent-soft text-warn": tone === "yellow", "bg-danger-soft text-danger": tone === "red",
  }, className)}>{children}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">{title}</h1>{description && <p className="mt-2 text-sm text-muted">{description}</p>}</div>{actions}</header>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Card className="py-12 text-center"><div aria-hidden="true" className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-2xl">✦</div><h2 className="text-lg font-bold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>{action && <div className="mt-5">{action}</div>}</Card>;
}

export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return <ol className="flex flex-wrap gap-2" aria-label="학습 단계">{["가르치기", "시험", "결과", "되짚기"].map((label, i) => <li key={label} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold", i + 1 <= current ? "bg-primary-soft text-primary" : "bg-bg text-muted")} aria-current={i + 1 === current ? "step" : undefined}>{i + 1}. {label}</li>)}</ol>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "삭제", busy, onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel?: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open, onCancel]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}><div className="w-full max-w-md rounded-card bg-surface p-6 shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><h2 id="confirm-title" className="text-xl font-bold">{title}</h2><p id="confirm-description" className="mt-2 text-sm text-muted">{description}</p><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onCancel} disabled={busy}>취소</Button><Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button></div></div></div>;
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  const [shown, setShown] = useState(message);
  useEffect(() => { setShown(message); if (!message) return; const timer = setTimeout(onClose, 5000); return () => clearTimeout(timer); }, [message, onClose]);
  if (!shown) return null;
  return <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-card bg-ink px-4 py-3 text-sm text-white shadow-lg" role="alert">{shown}<button className="ml-4 font-bold" aria-label="알림 닫기" onClick={onClose}>×</button></div>;
}
