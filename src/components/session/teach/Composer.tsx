"use client";
/**
 * 설명 입력창. Enter=줄바꿈, Ctrl/⌘+Enter=전송. 전송 중 비활성.
 */
import { useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/session/ui";

export const MAX_LEN = 2000;

export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  sending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && !sending && value.trim().length > 0 && value.length <= MAX_LEN;
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };
  return (
    <div className="rounded-card border border-line bg-surface p-3 shadow-card">
      <label htmlFor="explain-input" className="sr-only">
        설명 입력
      </label>
      <textarea
        id="explain-input"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        disabled={disabled || sending}
        rows={3}
        maxLength={MAX_LEN}
        placeholder="새내기의 질문에 선배의 말로 답해주세요."
        className="w-full resize-y rounded-sm border border-transparent bg-bg px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:bg-surface disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Enter 줄바꿈 · Ctrl+Enter 전송 · <span className={value.length > MAX_LEN - 100 ? "text-warn" : ""}>{value.length}/{MAX_LEN}</span>
        </p>
        <Button onClick={onSend} disabled={!canSend} loading={sending}>
          보내기
        </Button>
      </div>
    </div>
  );
}
