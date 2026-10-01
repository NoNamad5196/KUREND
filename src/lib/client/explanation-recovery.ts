import type { MessageDto } from "@/contracts/types";

export type ExplanationAttempt = { content: string; messageId?: string; afterMessageId?: string };
export type ExplanationRecovery = { status: "answered" | "unanswered"; messageId: string }
  | { status: "not_saved" | "unknown" };

/** Match this attempt, never an older explanation with identical wording. */
export function explanationRecovery(messages: MessageDto[], attempt: ExplanationAttempt): ExplanationRecovery {
  let index: number;
  if (attempt.messageId) {
    index = messages.findIndex((message) => message.messageId === attempt.messageId && message.role === "USER");
    if (index < 0) return { status: "unknown" };
  } else {
    const marker = attempt.afterMessageId ? messages.findIndex((message) => message.messageId === attempt.afterMessageId) : -1;
    if (attempt.afterMessageId && marker < 0) return { status: "unknown" };
    index = messages.findIndex((message, position) => position > marker && message.role === "USER" && message.content === attempt.content);
    if (index < 0) return { status: "not_saved" };
  }
  const following = messages[index + 1];
  if (following?.role === "JUNIOR") return { status: "answered", messageId: messages[index].messageId };
  if (!following) return { status: "unanswered", messageId: messages[index].messageId };
  // Another explanation followed this one. Its turn cannot safely be retried.
  return { status: "unknown" };
}
