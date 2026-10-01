"use client";
/**
 * 학습 화면 공통 UI. shell UI와 같은 디자인 토큰을 사용하며
 * 학습 화면의 기존 props와 알림·모달 동작을 유지한다.
 */
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useSyncExternalStore, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

/* ───────── Card ───────── */
export function Card({
  className,
  paper = false,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { paper?: boolean }) {
  return (
    <div
      className={clsx(
        "k-card border border-line",
        paper ? "bg-paper text-paper-ink" : "bg-surface",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ───────── Spinner ───────── */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

/* ───────── Button ───────── */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const variantCls: Record<ButtonVariant, string> = {
    primary: "k-button-primary",
    secondary: "k-button-secondary",
    ghost: "k-button-ghost",
    danger: "k-button-danger",
  };
  const sizeCls = { sm: "min-h-10 px-3 py-2 text-xs", md: "min-h-11 px-5 py-3 text-sm", lg: "min-h-12 px-6 py-3 text-base" }[size];
  return (
    <button
      type="button"
      className={clsx(
        "k-button inline-flex items-center justify-center gap-3 disabled:cursor-not-allowed disabled:opacity-50",
        variantCls[variant],
        sizeCls,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/* ───────── Chip ───────── */
export type ChipTone = "default" | "primary" | "accent" | "danger" | "ok" | "warn" | "muted";
export function Chip({
  tone = "default",
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  const toneCls: Record<ChipTone, string> = {
    default: "bg-bg text-ink border-line",
    primary: "bg-primary-soft text-primary border-primary/20",
    accent: "bg-accent-soft text-primary border-accent/40",
    danger: "bg-danger-soft text-danger border-danger/20",
    ok: "bg-ok-soft text-ok border-ok/20",
    warn: "bg-warn-soft text-warn border-warn/20",
    muted: "bg-bg text-muted border-line",
  };
  return (
    <span
      className={clsx(
        "k-chip inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap",
        toneCls[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/* ───────── Stepper (1 가르치기 · 2 시험 · 3 결과 · 4 되짚기) ───────── */
export const SESSION_STEPS = ["가르치기", "시험", "결과", "되짚기"] as const;
export function Stepper({
  steps = SESSION_STEPS as unknown as string[],
  current,
  className,
}: {
  steps?: string[];
  current: number; // 1-base
  className?: string;
}) {
  return (
    <ol className={clsx("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)} aria-label="진행 단계">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-1">
            <span
              aria-current={state === "active" ? "step" : undefined}
              className={clsx(
                "k-step inline-flex items-center gap-2 py-2",
                state === "active" && "text-primary font-semibold",
                state === "done" && "text-primary",
                state === "todo" && "text-muted",
              )}
            >
              <span
                className={clsx(
                  "inline-flex items-center justify-center font-mono text-[10px]",
                  state === "active" ? "text-primary" : "text-muted",
                )}
              >
                {state === "done" ? "✓" : `0${n}`}
              </span>
              {label}
            </span>
            {i < steps.length - 1 && <span className="sr-only">다음</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ───────── PageHeader ───────── */
export function PageHeader({
  title,
  subtitle,
  back,
  chip,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  chip?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("k-page-header flex flex-wrap items-end justify-between gap-5", className)}>
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="text-sm text-muted hover:text-ink">
            ← {back.label}
          </Link>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {chip}
          <h1 className="k-page-title">{title}</h1>
        </div>
        {subtitle && <p className="k-page-description mt-3 text-sm text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

/* ───────── EmptyState ───────── */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("k-empty flex flex-col items-center justify-center gap-3 text-center", className)}>
      <p className="text-2xl font-semibold tracking-tight">{title}</p>
      {description && <p className="max-w-md text-sm leading-7 text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ───────── Toast (모듈 스토어) ───────── */
export type ToastTone = "info" | "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone };
let toastSeq = 0;
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
export function toast(message: string, tone: ToastTone = "info", durationMs = 3500) {
  const id = ++toastSeq;
  toasts = [...toasts, { id, message, tone }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, durationMs);
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const EMPTY: ToastItem[] = [];
export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={clsx(
            "pointer-events-auto rounded-sm border px-4 py-2 text-sm shadow-card",
            t.tone === "error" && "border-danger/30 bg-danger-soft text-danger",
            t.tone === "success" && "border-ok/30 bg-ok-soft text-ok",
            t.tone === "info" && "border-line bg-surface text-ink",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* ───────── Modal / ConfirmDialog ───────── */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={clsx("w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-card", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="text-lg font-bold">{title}</h2>}
        <div className={clsx(title && "mt-3")}>{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "확인",
  cancelText = "취소",
  tone = "primary",
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      {description && <p className="text-sm text-muted">{description}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelText}
        </Button>
        <Button variant={tone} onClick={onConfirm} loading={loading}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

/* ───────── Drawer (우측) ───────── */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-ink/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        className={clsx("flex h-full w-full flex-col border-l border-line bg-surface shadow-card", width)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" className="rounded-sm px-2 py-1 text-sm text-muted hover:bg-bg" onClick={onClose}>
            닫기 ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </div>
  );
}

/* ───────── ProgressBar ───────── */
export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={clsx("h-2 w-full overflow-hidden rounded-full bg-line", className)} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}
