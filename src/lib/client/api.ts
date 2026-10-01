/**
 * Shared browser API client. All paths are relative to NEXT_PUBLIC_API_BASE.
 */
import type { SessionDto, SessionPhase, SessionStatus } from "@/contracts/types";
import { errorDetails, type ErrorDetails } from "@/contracts/errors";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number, readonly details: ErrorDetails = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function base(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function toApiError(res: Response): Promise<ApiError> {
  let code = "HTTP_ERROR";
  let message = `${res.status} ${res.statusText}`;
  let details: ErrorDetails = {};
  try {
    const body = await res.json();
    if (body?.error?.code) {
      code = String(body.error.code);
      message = String(body.error.message ?? message);
      details = errorDetails(body.error);
    }
  } catch {
    /* 본문이 JSON이 아니면 기본 메시지 유지 */
  }
  return new ApiError(code, message, res.status, details);
}

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(base(url), {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(u: string, init?: RequestInit) => json<T>(u, init),
  post: <T>(u: string, body?: unknown) =>
    json<T>(u, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(u: string, body?: unknown) =>
    json<T>(u, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(u: string) => json<T>(u, { method: "DELETE" }),
  upload: <T>(u: string, fd: FormData) => json<T>(u, { method: "POST", body: fd }),
};

/** §6 클라이언트 SSE 파서 (POST 가능, fetch + ReadableStream) */
export async function sse(
  url: string,
  init: RequestInit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEvent: (name: string, data: any) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(base(url), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    signal: signal ?? init.signal,
    cache: "no-store",
  });
  if (!res.ok || !res.body) throw await toApiError(res);
  if (!res.headers.get("content-type")?.includes("text/event-stream")) {
    throw new ApiError("LLM_FAILED", "응답 형식을 확인하지 못했습니다. 다시 시도해 주세요.", 502, { reason: "LLM_RESPONSE_PARSE_FAILED" });
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let name = "message";
  let lines: string[] = [];
  let finished = false;
  function consume(line: string) {
    if (!line) {
      if (!lines.length) { name = "message"; return; }
      let payload;
      try { payload = JSON.parse(lines.join("\n")); } catch {
        throw new ApiError("LLM_FAILED", "응답을 읽지 못했습니다. 다시 시도해 주세요.", 502, { reason: "LLM_RESPONSE_PARSE_FAILED" });
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new ApiError("LLM_FAILED", "응답 형식을 확인하지 못했습니다. 다시 시도해 주세요.", 502, { reason: "LLM_RESPONSE_PARSE_FAILED" });
      }
      onEvent(name, payload);
      if (name === "error") throw new ApiError(payload.code || "LLM_FAILED", payload.message || "응답을 받지 못했습니다. 다시 시도해 주세요.", 502, errorDetails(payload));
      finished = name === "done";
      name = "message"; lines = [];
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") name = value;
    else if (field === "data") lines.push(value);
  }
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      buf += done ? dec.decode() : dec.decode(value, { stream: true });
      let newline: RegExpExecArray | null;
      while ((newline = /\r\n|\r|\n/.exec(buf))) {
        // A CRLF boundary can itself span two network chunks.
        if (!done && newline[0] === "\r" && newline.index === buf.length - 1) break;
        const line = buf.slice(0, newline.index);
        buf = buf.slice(newline.index + newline[0].length);
        consume(line);
        if (finished) break;
      }
      if (done && !finished) throw new ApiError("LLM_FAILED", "응답 연결이 끊겼습니다. 저장된 설명으로 다시 시도해 주세요.", 502, { reason: "STREAM_INTERRUPTED" });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** §8-3 status → 경로. EXPLAINING 이면서 phase EXAM_READY 면 시험 인트로로 보낸다. */
export function routeForSession(s: { sessionId: string; status: SessionStatus; phase?: SessionPhase }): string {
  const id = s.sessionId;
  switch (s.status) {
    case "PREPARING":
      return `/session/${id}/prepare`;
    case "EXPLAINING":
      return s.phase === "EXAM_READY" ? `/session/${id}/exam` : `/session/${id}/teach`;
    case "EXAM_IN_PROGRESS":
      return `/session/${id}/exam`;
    case "EVALUATING":
    case "RESULT_READY":
      return `/session/${id}/result`;
    case "REVIEWING":
      return `/session/${id}/review`;
    case "COMPLETED":
      return `/session/${id}/complete`;
    case "FAILED":
    default:
      return `/session/${id}/teach`;
  }
}

export type { SessionDto };
