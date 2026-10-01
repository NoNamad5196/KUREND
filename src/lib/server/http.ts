/**
 * [C 소유] API 공통 응답/오류 헬퍼. D 도 import 해서 쓴다.
 *
 *  - 성공: json(data, status?)
 *  - 실패: { error: { code, message } } + 상태코드 (§5-1)
 *  - 라우트 핸들러는 withApi(handler) 로 감싸면 ApiError / zod 오류 / 예외가 자동으로 JSON 오류 응답이 된다.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { GameErrorCode } from "@/contracts/game";
import type { ApiErrorCode as FrozenApiErrorCode } from "@/contracts/types";
import type { ErrorDetails } from "@/contracts/errors";
import { logRequestFailure } from "./request-diagnostics";

/** FROZEN 오류 코드 + 게임 확장 코드(RUN_ACTIVE·NOT_READY·NO_RUN) */
export type ApiErrorCode = FrozenApiErrorCode | GameErrorCode;

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  NO_EXPLANATION: 409,
  UNAUTHORIZED: 401,
  VALIDATION: 400,
  LLM_FAILED: 502,
  RUN_ACTIVE: 409,
  NOT_READY: 409,
  NO_RUN: 404,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  constructor(code: ApiErrorCode, message: string, status = ERROR_STATUS[code], readonly details: ErrorDetails = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export const notFound = (message = "찾을 수 없습니다.") => new ApiError("NOT_FOUND", message);
export const invalidState = (message: string) => new ApiError("INVALID_STATE", message);
export const unauthorized = (message = "로그인이 필요합니다.") => new ApiError("UNAUTHORIZED", message);
export const validation = (message: string) => new ApiError("VALIDATION", message);

export function json<T>(data: T, init?: number | ResponseInit): NextResponse {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, { ...responseInit, headers: { "Cache-Control": "no-store", ...(responseInit?.headers ?? {}) } });
}

export function errorBody(code: ApiErrorCode | string, message: string) {
  return { error: { code, message } };
}

export function jsonError(code: ApiErrorCode, message: string, status = ERROR_STATUS[code]): NextResponse {
  return json(errorBody(code, message), status);
}

function zodMessage(err: ZodError): string {
  return err.issues
    .map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`)
    .slice(0, 3)
    .join(", ");
}

/** 예외 → JSON 오류 응답 */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) return json({ error: { code: err.code, message: err.message, ...err.details } }, err.status);
  if (err instanceof ZodError) return jsonError("VALIDATION", zodMessage(err));
  if (err instanceof SyntaxError) return jsonError("VALIDATION", "요청 본문이 올바른 JSON 이 아닙니다.");
  logRequestFailure(err, { stage: "api-request" });
  return json(errorBody("INTERNAL", "서버 오류가 발생했습니다. 다시 시도해 주세요."), 500);
}

type RouteContext<P> = { params: Promise<P> };
type Handler<P> = (req: Request, ctx: { params: P }) => Promise<Response> | Response;

/**
 * Next 15 route handler 래퍼: params(Promise) 해석 + 오류 변환.
 *   export const GET = withApi<{ id: string }>(async (req, { params }) => { ... });
 */
export function withApi<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx: RouteContext<P>): Promise<Response> => {
    try {
      const params = ((await ctx?.params) ?? {}) as P;
      return await handler(req, { params });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** JSON 본문 파싱 + zod 검증 (본문이 비어 있으면 {} 로 취급) */
export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw validation("요청 본문이 올바른 JSON 이 아닙니다.");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validation(zodMessage(parsed.error));
  return parsed.data;
}
