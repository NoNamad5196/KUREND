/**
 * [③] 객관식 보기(①~④). answer 가 보기 번호/문구로 시작하면 그 보기를 강조한다(남학생 EASY 시험).
 */
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import { examChoiceIndex } from "@/lib/shared/exam-format";
import clsx from "clsx";

export const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];

/** 보기 문구 앞에 이미 붙은 번호(①, 1., (1) 등)는 떼고 보여 준다 — 번호는 이 컴포넌트가 붙인다 */
export const stripChoiceMark = (choice: string) => choice.replace(/^\s*(?:[①②③④⑤⑥]|\(?[1-6][).])\s*/, "");

export function pickedChoiceIndex(answer: string | undefined, choices: string[]): number {
  if (!answer) return -1;
  const head = stripMarkdownBold(answer).trim();
  const examIndex = examChoiceIndex(head);
  if (examIndex >= 0 && examIndex < choices.length) return examIndex;
  const byMark = CIRCLED.findIndex((m) => head.startsWith(m));
  if (byMark >= 0 && byMark < choices.length) return byMark;
  const byNumber = /^\(?([1-6])[).]/.exec(head);
  if (byNumber) return Number(byNumber[1]) - 1;
  return choices.findIndex((c) => head.startsWith(stripMarkdownBold(c).trim()) || head.startsWith(stripChoiceMark(stripMarkdownBold(c)).trim()));
}

export function Choices({ choices, answer, correctIndex, className }: { choices: string[]; answer?: string; correctIndex?: number; className?: string }) {
  const picked = pickedChoiceIndex(answer, choices);
  return (
    <ol className={clsx("space-y-2 font-sans text-sm sm:text-[15px]", className)} aria-label="보기">
      {choices.map((choice, i) => {
        const isPicked = i === picked;
        const isCorrect = correctIndex === i;
        return (
          <li
            key={i}
            className={clsx(
              "grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-sm border px-4 py-4 leading-6 transition-colors sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]",
              isPicked && isCorrect !== false && correctIndex === undefined && "border-primary bg-primary-soft font-semibold",
              isPicked && correctIndex !== undefined && (isCorrect ? "border-ok bg-ok-soft font-semibold" : "border-danger bg-danger-soft font-semibold line-through decoration-danger/60"),
              !isPicked && isCorrect && "border-ok/60 bg-ok-soft/60",
              !isPicked && !isCorrect && "border-paper-rule bg-surface/40",
            )}
          >
            <span className="shrink-0 font-bold">{CIRCLED[i] ?? `${i + 1}.`}</span>
            <span className="min-w-0 break-words">{stripChoiceMark(stripMarkdownBold(choice))}</span>
            {isPicked && <span className="col-start-2 text-xs font-medium text-muted sm:col-start-3">새내기 선택</span>}
          </li>
        );
      })}
    </ol>
  );
}
