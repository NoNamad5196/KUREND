import { errorDetails } from "@/contracts/errors";

export type RequestTrace = {
  sessionId?: string; materialId?: string; character?: string;
  stage: string; provider?: string;
};

/** Never log exception messages, request bodies, model output, or SDK headers. */
export function logRequestFailure(error: unknown, trace: RequestTrace) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const allowedTypes = ["ApiError", "RouteError", "LlmFailure", "SyntaxError", "ZodError", "AbortError", "TimeoutError"];
  const status = typeof value.providerStatus === "number" ? value.providerStatus : value.status;
  console.error("[study-request]", {
    ...trace,
    stage: typeof value.stage === "string" && /^[a-z-]{1,40}$/.test(value.stage) ? value.stage : trace.stage,
    errorType: allowedTypes.includes(String(value.name)) ? value.name : "Error",
    status: typeof status === "number" && status >= 400 && status <= 599 ? status : undefined,
    reason: errorDetails(value.details).reason,
  });
}
