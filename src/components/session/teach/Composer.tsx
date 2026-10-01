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
  embedded = false,
  placeholder = "새내기의 질문에 선배의 말로 답해주세요.",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  /** 채팅 카드 안에 붙일 때(테두리·그림자 없이 위쪽 구분선만) */
  embedded?: boolean;
  placeholder?: string;
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
    <div className={embedded ? "border-t border-line bg-bg/50 p-4 sm:p-6" : "rounded-sm border border-line bg-surface p-4 sm:p-6"}>
      <label htmlFor="explain-input" className="mb-3 block text-sm font-semibold">
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
        placeholder={placeholder}
        className="min-h-[116px] w-full resize-y rounded-sm border border-line bg-surface px-4 py-3 text-base leading-7 outline-none transition-colors placeholder:text-muted/80 focus:border-primary disabled:opacity-60"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] leading-5 text-muted">
          Enter 줄바꿈 · Ctrl+Enter 전송 · <span className={value.length > MAX_LEN - 100 ? "text-warn" : ""}>{value.length}/{MAX_LEN}</span>
        </p>
        <Button onClick={onSend} disabled={!canSend} loading={sending}>
          보내기
        </Button>
      </div>
    </div>
  );
}
