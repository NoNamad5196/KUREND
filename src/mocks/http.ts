/** [B] mock 라우트 공통: 오류 타입, JSON 응답, 본문 검증, 핸들러 래퍼 */
import type { ZodType } from "zod";

export class MockError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "MockError";
    this.status = status;
    this.code = code;
  }
}

/** 받침 유무에 따라 을/를 */
export function eulReul(word: string): string {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return `${word}를`;
  return (ch - 0xac00) % 28 ? `${word}을` : `${word}를`;
}
export const notFound = (what = "리소스") => new MockError(404, "NOT_FOUND", `${eulReul(what)} 찾을 수 없습니다.`);
export const invalidState = (message = "현재 상태에서는 허용되지 않는 요청입니다.") =>
  new MockError(409, "INVALID_STATE", message);

export function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function ok(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, { status: 200, ...init });
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new MockError(400, "VALIDATION", "본문이 올바른 JSON이 아닙니다.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new MockError(400, "VALIDATION", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || "요청 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export type Ctx<P> = { params: Promise<P> };

export function withMock<P>(handler: (req: Request, ctx: Ctx<P>) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof MockError) return jsonError(e.code, e.message, e.status);
      console.error("[mock] unexpected error", e);
      return jsonError("INTERNAL", e instanceof Error ? e.message : "서버 오류", 500);
    }
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}
