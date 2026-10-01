"use client";
/**
 * 글자 단위 타이핑 연출. text 가 늘어나면(문장 추가) 이어서 치고, 접두사가 바뀌면 처음부터 다시 친다.
 * instant 또는 prefers-reduced-motion 이면 즉시 전체 표시. 끝에 도달하면 onDone 1회 호출.
 */
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function TypingText({
  text,
  speedMs = 20,
  instant = false,
  cursor = false,
  onDone,
  className,
  as: Tag = "span",
}: {
  text: string;
  speedMs?: number;
  instant?: boolean;
  cursor?: boolean;
  onDone?: () => void;
  className?: string;
  as?: "span" | "p" | "div";
}) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const prevTextRef = useRef("");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reduced = usePrefersReducedMotion();
  const immediate = instant || reduced;

  useEffect(() => {
    const prev = prevTextRef.current;
    prevTextRef.current = text;
    if (!text.startsWith(prev)) {
      shownRef.current = 0;
      setShown(0);
    }
    if (immediate) {
      shownRef.current = text.length;
      setShown(text.length);
      onDoneRef.current?.();
      return;
    }
    if (shownRef.current >= text.length) return;
    const id = window.setInterval(() => {
      shownRef.current = Math.min(text.length, shownRef.current + 1);
      setShown(shownRef.current);
      if (shownRef.current >= text.length) {
        window.clearInterval(id);
        onDoneRef.current?.();
      }
    }, Math.max(1, speedMs));
    return () => window.clearInterval(id);
  }, [text, speedMs, immediate]);

  const visible = text.slice(0, Math.min(shown, text.length));
  const typing = visible.length < text.length;
  return (
    <Tag className={clsx("whitespace-pre-wrap", className)} aria-live="polite">
      {visible}
      {cursor && typing && (
        <span aria-hidden className="ml-0.5 inline-block animate-pulse">
          ▍
        </span>
      )}
    </Tag>
  );
}
