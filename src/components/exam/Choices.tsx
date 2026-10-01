/**
 * [③] 객관식 보기(①~④). answer 가 보기 번호/문구로 시작하면 그 보기를 강조한다(남학생 EASY 시험).
 */
import clsx from "clsx";

export const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];

export function pickedChoiceIndex(answer: string | undefined, choices: string[]): number {
  if (!answer) return -1;
  const head = answer.trim();
  const byMark = CIRCLED.findIndex((m) => head.startsWith(m));
  if (byMark >= 0 && byMark < choices.length) return byMark;
  const byNumber = /^\(?([1-6])[).]/.exec(head);
  if (byNumber) return Number(byNumber[1]) - 1;
  return choices.findIndex((c) => head.startsWith(c.trim()));
}

export function Choices({ choices, answer, correctIndex, className }: { choices: string[]; answer?: string; correctIndex?: number; className?: string }) {
  const picked = pickedChoiceIndex(answer, choices);
  return (
    <ol className={clsx("space-y-1.5 font-sans text-sm sm:text-[15px]", className)} aria-label="보기">
      {choices.map((choice, i) => {
        const isPicked = i === picked;
        const isCorrect = correctIndex === i;
        return (
          <li
            key={i}
            className={clsx(
              "flex items-start gap-2 rounded-sm border px-3 py-2 leading-6 transition",
              isPicked && isCorrect !== false && correctIndex === undefined && "border-primary bg-primary-soft font-semibold",
              isPicked && correctIndex !== undefined && (isCorrect ? "border-ok bg-[#E6F2E7] font-semibold" : "border-danger bg-danger-soft font-semibold line-through decoration-danger/60"),
              !isPicked && isCorrect && "border-ok/60 bg-[#E6F2E7]/60",
              !isPicked && !isCorrect && "border-paper-rule bg-surface/60",
            )}
          >
            <span className="shrink-0 font-bold">{CIRCLED[i] ?? `${i + 1}.`}</span>
            <span className="min-w-0 break-words">{choice}</span>
            {isPicked && <span className="ml-auto shrink-0 text-xs text-muted">새내기 선택</span>}
          </li>
        );
      })}
    </ol>
  );
}
