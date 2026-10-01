"use client";
/**
 * 과거 턴 묶음 카드: "새내기의 질문(또는 되물음) / 내 설명 / 새내기의 반응".
 */
import clsx from "clsx";
import type { MessageDto } from "@/contracts/types";
import { SpeechBubble } from "@/components/session/SpeechBubble";
import { Card } from "@/components/session/ui";

export type Turn = {
  key: string;
  prompt: MessageDto | null; // JUNIOR QUESTION | DOUBT
  answer: MessageDto | null; // USER ANSWER
  reaction: MessageDto | null; // JUNIOR REACTION
};

/** 메시지 배열 → 턴 묶음. 마지막 턴에 답이 없으면(=현재 질문) 분리해서 돌려준다. */
export function groupTurns(messages: MessageDto[]): { history: Turn[]; current: MessageDto | null } {
  const turns: Turn[] = [];
  for (const m of messages) {
    const last: Turn | undefined = turns[turns.length - 1];
    if (m.role === "JUNIOR" && (m.stage === "QUESTION" || m.stage === "DOUBT")) {
      turns.push({ key: m.messageId, prompt: m, answer: null, reaction: null });
    } else if (m.role === "USER") {
      if (!last || last.answer) {
        turns.push({ key: `u-${m.messageId}`, prompt: null, answer: m, reaction: null });
      } else {
        last.answer = m;
      }
    } else if (m.role === "JUNIOR" && m.stage === "REACTION") {
      if (!last) {
        turns.push({ key: `r-${m.messageId}`, prompt: null, answer: null, reaction: m });
      } else {
        last.reaction = m;
      }
    }
  }
  const tail = turns[turns.length - 1];
  if (tail && tail.prompt && !tail.answer && !tail.reaction) {
    return { history: turns.slice(0, -1), current: tail.prompt };
  }
  return { history: turns, current: null };
}

export function TurnCard({ turn, index }: { turn: Turn; index: number }) {
  const isDoubt = turn.prompt?.stage === "DOUBT";
  return (
    <Card className="px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>{index + 1}번째 설명</span>
        <time dateTime={turn.answer?.createdAt}>{formatTime(turn.answer?.createdAt ?? turn.prompt?.createdAt)}</time>
      </div>
      <div className="space-y-3">
        {turn.prompt && (
          <SpeechBubble speaker={isDoubt ? "새내기 · 되물음" : "새내기 · 질문"} tone={isDoubt ? "doubt" : "muted"} tail="none">
            {turn.prompt.content}
          </SpeechBubble>
        )}
        {turn.answer && (
          <div className="flex justify-end">
            <SpeechBubble speaker="내 설명" tone="user" tail="none" className="max-w-[92%]">
              {turn.answer.content}
            </SpeechBubble>
          </div>
        )}
        {turn.reaction && (
          <p className={clsx("text-sm text-muted")}>
            <span className="mr-1 font-semibold text-ink">새내기 ·</span>
            {turn.reaction.content}
          </p>
        )}
      </div>
    </Card>
  );
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
