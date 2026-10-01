/**
 * [B 로컬 복사본] A의 `src/lib/client/api.ts`와 동일 시그니처.
 * TODO(B): A의 api.ts가 main에 머지되면 이 파일을 지우고 `@/lib/client/api`로 import 교체.
 */
import type { SessionDto, SessionPhase, SessionStatus } from "@/contracts/types";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
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
  try {
    const body = await res.json();
    if (body?.error?.code) {
      code = String(body.error.code);
      message = String(body.error.message ?? message);
    }
  } catch {
    /* 본문이 JSON이 아니면 기본 메시지 유지 */
  }
  return new ApiError(code, message, res.status);
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
  get: <T>(u: string) => json<T>(u),
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
    signal,
    cache: "no-store",
  });
  if (!res.ok || !res.body) throw await toApiError(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (chunk.startsWith(":")) continue;
      let name = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      onEvent(name, data ? JSON.parse(data) : {});
    }
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
