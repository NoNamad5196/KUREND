import type { LearningErrorReason } from "@/contracts/types";
import { plainExamAnswer } from "@/lib/shared/exam-answer-text";
import { LEARNING_ERROR_LABELS } from "@/lib/learning/error-reason";

/** The confirmed grading evidence stays visible before the optional reflection exercise. */
export function LearningErrorFeedback({ errorReason = "UNKNOWN", evidenceQuote, sourceExcerpt, answer }: {
  errorReason?: LearningErrorReason; evidenceQuote: string; sourceExcerpt: string; answer?: string;
}) {
  return <section className="mt-4 min-w-0 space-y-3 rounded-sm border border-line bg-surface px-4 py-4 font-sans text-sm leading-7" aria-label="틀린 이유" data-error-reason={errorReason}>
    <h4 className="font-semibold text-ink">틀린 이유</h4>
    <p className="break-words">{LEARNING_ERROR_LABELS[errorReason]}</p>
    <dl className="space-y-3">
      <div><dt className="text-xs font-semibold text-muted">학습한 설명</dt><dd className="mt-1 whitespace-pre-wrap break-words">{evidenceQuote ? `“${evidenceQuote}”` : "관련 설명의 근거가 확인되지 않았습니다."}</dd></div>
      {answer !== undefined && <div><dt className="text-xs font-semibold text-muted">실제 답안</dt><dd className="mt-1 whitespace-pre-wrap break-words">{plainExamAnswer(answer) || "답하지 못함"}</dd></div>}
      {sourceExcerpt && <div><dt className="text-xs font-semibold text-primary">자료의 정답 근거</dt><dd className="mt-1 whitespace-pre-wrap break-words">{sourceExcerpt}</dd></div>}
    </dl>
  </section>;
}
