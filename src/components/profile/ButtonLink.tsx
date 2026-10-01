import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

/** shell/ui 의 Button 과 같은 모양의 링크 (a 안에 button 을 넣지 않기 위해) */
export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: "primary" | "secondary" | "ghost"; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors",
        {
          "bg-primary text-primary-ink hover:bg-[#185b4b]": variant === "primary",
          "border border-line bg-surface text-ink hover:bg-bg": variant === "secondary",
          "text-primary hover:bg-primary-soft": variant === "ghost",
        },
        className,
      )}
    >
      {children}
    </Link>
  );
}
