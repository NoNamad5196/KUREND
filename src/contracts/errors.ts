import { z } from "zod";

/** Diagnostic detail supplements the existing HTTP/SSE error codes. */
export const ErrorDetailsSchema = z.object({
  reason: z.enum([
    "MATERIAL_NOT_FOUND", "SESSION_NOT_FOUND", "CHAT_SESSION_INVALID",
    "CHARACTER_CONFIG_NOT_FOUND", "LLM_REQUEST_FAILED", "LLM_RESPONSE_PARSE_FAILED",
    "LLM_TIMEOUT", "LLM_CONFIG_INVALID", "STREAM_INTERRUPTED",
  ]).optional(),
  replacementSessionId: z.string().regex(/^sess_[A-Za-z0-9_-]+$/).optional(),
  materialId: z.string().regex(/^mat_[A-Za-z0-9_-]+$/).optional(),
});
export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;
export type ErrorReason = NonNullable<ErrorDetails["reason"]>;

export function errorDetails(value: unknown): ErrorDetails {
  const parsed = ErrorDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
