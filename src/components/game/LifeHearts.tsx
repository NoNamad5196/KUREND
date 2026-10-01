"use client";
/**
 * [③] LIFE 하트. lives 가 줄면 잃은 하트가 깨지고(회색), 늘면 새 하트가 튀어나온다. 가득 차면 살짝 두근거림.
 * props: lives, maxLives, size(px, 기본 20), animate(변화 애니메이션, 기본 true), label
 */
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import "./game.css";

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.8 4.5c2 0 3.6 1.1 4.4 2.3.8-1.2 2.4-2.3 4.4-2.3 3.8 0 6 3.7 4.4 7.3C19.5 16.4 12 21 12 21z"
        fill={filled ? "#E4573D" : "none"}
        stroke={filled ? "#B9381F" : "#B9A8A2"}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeDasharray={filled ? undefined : "2.5 2"}
      />
      {filled && <path d="M7.2 8.2c.6-1 1.6-1.6 2.6-1.6" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />}
    </svg>
  );
}

export function LifeHearts({
  lives,
  maxLives,
  size = 20,
  animate = true,
  className,
  label,
}: {
  lives: number;
  maxLives: number;
  size?: number;
  animate?: boolean;
  className?: string;
  label?: string;
}) {
  const prev = useRef(lives);
  const [changed, setChanged] = useState<{ index: number; kind: "lost" | "gained" } | null>(null);
  useEffect(() => {
    if (!animate || prev.current === lives) return;
    const kind = lives < prev.current ? "lost" : "gained";
    const index = kind === "lost" ? lives : lives - 1;
    prev.current = lives;
    setChanged({ index, kind });
    const t = window.setTimeout(() => setChanged(null), 1000);
    return () => window.clearTimeout(t);
  }, [lives, animate]);
  const full = lives >= maxLives;
  return (
    <span className={clsx("lh", className)} style={{ fontSize: size }} role="img" aria-label={label ?? `LIFE ${lives} / ${maxLives}`}>
      {Array.from({ length: maxLives }, (_, i) => {
        const filled = i < lives;
        const state = changed?.index === i ? changed.kind : null;
        return (
          <HeartIcon
            key={i}
            filled={filled || state === "lost"}
            className={clsx("lh-heart", !filled && state !== "lost" && "lh-empty", state === "lost" && "lh-lost", state === "gained" && "lh-gained", full && filled && "lh-full")}
          />
        );
      })}
    </span>
  );
}
