/**
 * Web Speech API(음성 인식) 얇은 래퍼 — 브라우저 내장 인식기로 한국어(ko-KR) 설명을 받아쓴다.
 * Chrome·Edge·Safari(webkit 접두사) 지원, Firefox 등 미지원 브라우저에서는 isSpeechSupported() === false.
 * TS 기본 DOM 타입에 인식기 타입이 없어 필요한 최소 인터페이스만 여기서 선언한다(any 금지).
 */

interface SpeechAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternativeLike;
}
interface SpeechResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechResultLike;
}
interface SpeechResultEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechResultListLike;
}
interface SpeechErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 이 브라우저에서 음성 인식을 쓸 수 있는지 (SSR 에서는 항상 false) */
export function isSpeechSupported(): boolean {
  return recognitionCtor() !== null;
}

/**
 * 브라우저가 주는 오류 코드: not-allowed · service-not-allowed · no-speech · audio-capture · network ·
 * aborted · language-not-supported · bad-grammar. 래퍼 자체 코드: unsupported · start-failed.
 */
export type SpeechErrorCode = string;

export type RecognizerHandlers = {
  /** 아직 확정되지 않은 받아쓰기(계속 바뀜). 빈 문자열이면 지울 것 */
  onInterim?: (text: string) => void;
  /** 확정된 문장 조각(한 번만 전달) */
  onFinal?: (text: string) => void;
  onError?: (code: SpeechErrorCode) => void;
  /** 인식이 끝났을 때(정상 종료·오류·stop/abort 모두) 항상 한 번 */
  onEnd?: () => void;
};

export type Recognizer = {
  start: () => void;
  /** 듣기를 멈추고, 남은 확정 결과는 onFinal 로 마저 전달한다 */
  stop: () => void;
  /** 남은 결과를 버리고 즉시 멈춘다 */
  abort: () => void;
};

/** 사용자에게 보여줄 한국어 안내. 굳이 알릴 필요 없는 코드(aborted)는 null */
export function speechErrorMessage(code: SpeechErrorCode): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "마이크 권한이 필요해요. 주소창의 마이크 설정에서 허용해 주세요.";
    case "no-speech":
      return "목소리가 들리지 않았어요. 마이크를 다시 눌러 말해 주세요.";
    case "audio-capture":
      return "마이크를 찾을 수 없어요. 연결 상태를 확인해 주세요.";
    case "network":
      return "음성 인식 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.";
    case "language-not-supported":
      return "이 브라우저는 한국어 음성 인식을 지원하지 않아요.";
    case "unsupported":
      return "이 브라우저는 음성 입력을 지원하지 않아요. Chrome 이나 Edge 를 써 보세요.";
    case "start-failed":
      return "음성 인식을 시작하지 못했어요. 잠시 후 다시 눌러 주세요.";
    default:
      return "음성 인식 중 문제가 생겼어요. 다시 시도해 주세요.";
  }
}

/** Android Chrome 은 continuous 모드에서 확정 결과마다 앞 문장을 누적해서 다시 보내는 버그가 있다. */
function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export function createRecognizer(handlers: RecognizerHandlers, options: { lang?: string } = {}): Recognizer {
  let rec: SpeechRecognitionLike | null = null;
  /** 이미 onFinal 로 보낸 결과 인덱스(같은 결과를 두 번 붙이지 않기 위해) */
  let emittedUpTo = 0;
  let lastFinal = "";
  const cumulativeFinals = isAndroid();

  const detach = (r: SpeechRecognitionLike) => {
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    if (rec === r) rec = null;
  };

  const emitFinal = (raw: string) => {
    let text = raw.trim();
    if (!text) return;
    if (cumulativeFinals && lastFinal && text.startsWith(lastFinal)) {
      const whole = text;
      text = text.slice(lastFinal.length).trim();
      lastFinal = whole;
      if (!text) return;
    } else {
      lastFinal = text;
    }
    handlers.onFinal?.(text);
  };

  return {
    start() {
      if (rec) return;
      const Ctor = recognitionCtor();
      if (!Ctor) {
        handlers.onError?.("unsupported");
        handlers.onEnd?.();
        return;
      }
      const r = new Ctor();
      r.lang = options.lang ?? "ko-KR";
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      emittedUpTo = 0;
      lastFinal = "";

      r.onresult = (event) => {
        const finals: string[] = [];
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript ?? "";
          if (result?.isFinal) {
            if (i >= emittedUpTo) {
              finals.push(transcript);
              emittedUpTo = i + 1;
            }
          } else {
            interim += transcript;
          }
        }
        for (const text of finals) emitFinal(text);
        handlers.onInterim?.(interim.trim());
      };
      r.onerror = (event) => handlers.onError?.(event.error);
      r.onend = () => {
        detach(r);
        handlers.onInterim?.("");
        handlers.onEnd?.();
      };

      rec = r;
      try {
        r.start();
      } catch {
        detach(r);
        handlers.onError?.("start-failed");
        handlers.onEnd?.();
      }
    },
    stop() {
      try {
        rec?.stop();
      } catch {
        /* 이미 멈춘 인식기 */
      }
    },
    abort() {
      try {
        rec?.abort();
      } catch {
        /* 이미 멈춘 인식기 */
      }
    },
  };
}
