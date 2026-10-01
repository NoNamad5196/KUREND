"use client";
/**
 * 음성으로 설명하기 — 마이크 토글 버튼 + 입력창 아래 실시간 자막.
 * 확정된 문장만 입력창(draft) 끝에 띄어쓰기 한 칸과 함께 붙이고, 아직 바뀌는 중간 결과는 자막으로만 보여준다.
 * 미지원 브라우저(Firefox 등)에서는 버튼·자막 모두 렌더링하지 않는다.
 *
 * 사용: const voice = useVoiceInput({ value, onChange, maxLength, disabled });
 *       <VoiceCaption voice={voice} /> (입력창 아래) · <VoiceInputButton voice={voice} /> (보내기 옆)
 *       전송 직전에 voice.stop() 을 부르면 듣기를 멈춘다. disabled 가 true 가 되면 자동으로 멈춘다.
 */
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createRecognizer, isSpeechSupported, speechErrorMessage, type Recognizer } from "@/lib/client/speech";

type Notice = { text: string; tone: "error" | "info" };

export type VoiceInput = {
  supported: boolean;
  listening: boolean;
  /** 아직 확정되지 않은 받아쓰기(자막용) */
  interim: string;
  notice: Notice | null;
  disabled: boolean;
  toggle: () => void;
  stop: () => void;
  dismissNotice: () => void;
};

const noopSubscribe = () => () => {};

/** draft 끝에 붙인다: 비어 있지 않고 공백으로 끝나지 않으면 한 칸 띄운다. maxLength 를 넘는 부분은 잘라낸다. */
function appendTranscript(current: string, text: string, maxLength: number): { next: string; truncated: boolean } {
  const separator = current && !/\s$/.test(current) ? " " : "";
  const room = maxLength - current.length - separator.length;
  if (room <= 0) return { next: current, truncated: true };
  const piece = text.length > room ? text.slice(0, room) : text;
  return { next: current + separator + piece, truncated: piece.length < text.length };
}

export function useVoiceInput({
  value,
  onChange,
  maxLength,
  disabled = false,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
  /** 받아쓴 문장을 붙인 뒤 입력창을 맨 아래로 스크롤 */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}): VoiceInput {
  const supported = useSyncExternalStore(noopSubscribe, isSpeechSupported, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const recognizer = useRef<Recognizer | null>(null);
  // 확정 결과는 비동기로 도착하므로 최신 draft·onChange 를 ref 로 들고 있는다.
  const latest = useRef({ value, onChange, textareaRef });
  useEffect(() => {
    latest.current = { value, onChange, textareaRef };
  });

  const stop = useCallback(() => {
    const current = recognizer.current;
    if (!current) return;
    recognizer.current = null; // 남은 확정 결과는 계속 붙인다(stop 은 abort 가 아님)
    current.stop();
    setListening(false);
    setInterim("");
  }, []);

  const append = useCallback(
    (text: string) => {
      const clean = text.replace(/\s+/g, " ").trim();
      if (!clean) return;
      const { value: current, onChange: change, textareaRef: ref } = latest.current;
      const { next, truncated } = appendTranscript(current, clean, maxLength);
      if (next !== current) {
        latest.current = { ...latest.current, value: next }; // 다음 결과가 렌더 전에 와도 이어 붙도록
        change(next);
        const el = ref?.current;
        if (el) window.requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      }
      if (truncated) {
        stop();
        setNotice({ text: `설명은 ${maxLength.toLocaleString()}자까지 입력할 수 있어요. 음성 입력을 멈췄어요.`, tone: "info" });
      }
    },
    [maxLength, stop],
  );

  const start = useCallback(() => {
    if (recognizer.current || disabled) return;
    if (latest.current.value.length >= maxLength) {
      setNotice({ text: `설명은 ${maxLength.toLocaleString()}자까지 입력할 수 있어요.`, tone: "info" });
      return;
    }
    setNotice(null);
    setInterim("");
    const rec: Recognizer = createRecognizer({
      onInterim: (text) => {
        if (recognizer.current === rec) setInterim(text);
      },
      onFinal: (text) => append(text),
      onError: (code) => {
        const message = speechErrorMessage(code);
        if (message) setNotice({ text: message, tone: code === "no-speech" ? "info" : "error" });
      },
      onEnd: () => {
        if (recognizer.current !== rec) return;
        recognizer.current = null;
        setListening(false);
        setInterim("");
      },
    });
    recognizer.current = rec;
    setListening(true);
    rec.start();
  }, [append, disabled, maxLength]);

  const toggle = useCallback(() => {
    if (recognizer.current) stop();
    else start();
  }, [start, stop]);

  // 전송 중·비활성이 되면 듣기를 멈춘다.
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  // 화면을 떠나면 남은 결과까지 버리고 마이크를 끈다.
  const abortOnUnmount = useCallback(() => {
    recognizer.current?.abort();
    recognizer.current = null;
  }, []);
  useEffect(() => abortOnUnmount, [abortOnUnmount]);

  // 안내 메시지는 잠시 뒤 사라진다.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.tone === "error" ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { supported, listening, interim, notice, disabled, toggle, stop, dismissNotice };
}

function PulseDot({ className }: { className?: string }) {
  return (
    <span className={clsx("relative inline-flex h-2.5 w-2.5 shrink-0", className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
    </span>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
    </svg>
  );
}

/** 마이크 토글. 모바일에서는 아이콘만, sm 이상에서는 짧은 글자도 함께 보인다. */
export function VoiceInputButton({ voice, className }: { voice: VoiceInput; className?: string }) {
  if (!voice.supported) return null;
  const { listening } = voice;
  const label = listening ? "듣는 중… 눌러서 멈추기" : "음성으로 설명하기";
  return (
    <button
      type="button"
      onClick={voice.toggle}
      disabled={voice.disabled && !listening}
      aria-label={label}
      title={label}
      className={clsx(
        "relative inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-sm border px-2.5 text-sm font-semibold transition sm:px-3",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
        listening ? "border-danger/40 bg-danger-soft text-danger hover:bg-danger/15" : "border-line bg-surface text-ink hover:bg-bg",
        className,
      )}
    >
      {listening ? (
        <>
          <StopIcon className="h-4 w-4 sm:hidden" />
          <PulseDot className="absolute -right-1 -top-1 sm:static" />
          <span className="hidden sm:inline">듣는 중…</span>
        </>
      ) : (
        <>
          <MicIcon className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">음성으로 설명</span>
        </>
      )}
    </button>
  );
}

/** 입력창 바로 아래: 듣는 중 실시간 자막 / 오류·안내 메시지. */
export function VoiceCaption({ voice, className }: { voice: VoiceInput; className?: string }) {
  if (!voice.supported) return null;
  const { listening, interim, notice } = voice;
  return (
    <div className={className}>
      <p className="sr-only" aria-live="polite">
        {listening ? "음성 입력을 듣고 있어요. 확정된 문장은 입력창에 들어가요." : ""}
      </p>
      {listening && (
        <div className="mt-2 flex items-start gap-2 rounded-sm border border-danger/20 bg-danger-soft/60 px-3 py-2 text-xs leading-5">
          <PulseDot className="mt-[5px]" />
          <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {interim ? (
              <span className="text-ink/70 italic">{interim}</span>
            ) : (
              <span className="text-muted">듣는 중… 편하게 말해 보세요. 문장이 끝나면 입력창에 들어가요.</span>
            )}
          </p>
        </div>
      )}
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={clsx(
            "mt-2 flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-5 shadow-card",
            notice.tone === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-surface text-ink",
          )}
        >
          <MicIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="min-w-0 flex-1">{notice.text}</p>
          <button type="button" onClick={voice.dismissNotice} className="-my-0.5 shrink-0 rounded px-1 font-bold opacity-70 hover:opacity-100" aria-label="안내 닫기">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
