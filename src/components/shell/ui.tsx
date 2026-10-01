"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("k-card border border-line bg-surface p-5", className)} {...props}>{children}</div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean };
export function Button({ variant = "primary", loading, className, children, disabled, ...props }: ButtonProps) {
  return <button className={clsx("k-button inline-flex items-center justify-center gap-3 px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50", `k-button-${variant}`, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}{children}</button>;
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "green" | "yellow" | "red"; className?: string }) {
  return <span className={clsx("k-chip inline-flex items-center px-2 py-1 text-[11px] font-medium", {
    "bg-bg text-muted": tone === "neutral", "bg-primary-soft text-primary": tone === "green",
    "bg-accent-soft text-warn": tone === "yellow", "bg-danger-soft text-danger": tone === "red",
  }, className)}>{children}</span>;
}

export function PageHeader({ title, description, actions, eyebrow = "KUREND / MY CAMPUS" }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return <header className="k-page-header flex flex-wrap items-end justify-between gap-6"><div className="min-w-0"><p className="editorial-label mb-4 text-primary">{eyebrow}</p><h1 className="k-page-title">{title}</h1>{description && <p className="k-page-description mt-4 text-sm text-muted">{description}</p>}</div>{actions}</header>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Card className="k-empty text-center"><span aria-hidden="true" className="mb-6 inline-block text-4xl font-light text-primary">↗</span><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted">{description}</p>{action && <div className="mt-7">{action}</div>}</Card>;
}

export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return <ol className="flex flex-wrap gap-3" aria-label="학습 단계">{["가르치기", "시험", "결과", "되짚기"].map((label, i) => <li key={label} className={clsx("k-step px-1 py-2 text-xs font-semibold", i + 1 <= current ? "text-primary" : "text-muted")} aria-current={i + 1 === current ? "step" : undefined}><span className="mr-2 font-mono text-[10px]">0{i + 1}</span>{label}</li>)}</ol>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "삭제", busy, onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel?: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open, onCancel]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}><div className="w-full max-w-md rounded-card border border-line bg-surface p-6" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><h2 id="confirm-title" className="text-xl font-bold">{title}</h2><p id="confirm-description" className="mt-2 text-sm text-muted">{description}</p><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onCancel} disabled={busy}>취소</Button><Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button></div></div></div>;
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  const [shown, setShown] = useState(message);
  useEffect(() => { setShown(message); if (!message) return; const timer = setTimeout(onClose, 5000); return () => clearTimeout(timer); }, [message, onClose]);
  if (!shown) return null;
  return <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-card bg-ink px-4 py-3 text-sm text-white border border-ink" role="alert">{shown}<button className="ml-4 font-bold" aria-label="알림 닫기" onClick={onClose}>×</button></div>;
}
