"use client";
import { Card, Button } from "@/components/shell/ui";
import "./material-preparation.css";

export type MaterialStep = "READING" | "SPLITTING" | "TITLING";
const labels: Record<MaterialStep, string> = {
  READING: "강의노트를 읽고 있어요…",
  SPLITTING: "목차를 정리하고 있어요…",
  TITLING: "어디부터 공부할지 살펴보는 중…",
};

export function MaterialPreparation({ step, busy, error, onRetry }: {
  step: MaterialStep; busy: boolean; error: string | null; onRetry: () => void;
}) {
  return <Card className="max-w-2xl py-10 text-center" aria-busy={busy}>
    <div className={`material-book ${busy ? "material-book-reading" : ""}`} aria-hidden="true">
      <span className="material-book-page" /><span className="material-book-page" /><span className="material-book-page" />
      <span className="material-book-star">✦</span>
    </div>
    <h2 className="mt-5 text-xl font-bold">{error ? "목차를 만들지 못했어요" : "목차 추출 중"}</h2>
    <p className="mt-2 text-muted" role={error ? "alert" : "status"} aria-live="polite">{error || labels[step]}</p>
    <ol className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-3 text-xs text-muted" aria-label="자료 준비 단계">
      <li className="text-ok">✓ 파일 업로드·분석 완료</li>
      <li className={busy ? "font-bold text-primary" : "text-danger"}>{error ? "목차 추출 실패" : "목차 추출 중"}</li>
      <li>학습 자료 준비 완료</li>
    </ol>
    {!busy && <Button className="mt-6" onClick={onRetry}>목차 생성 다시 시도</Button>}
  </Card>;
}
