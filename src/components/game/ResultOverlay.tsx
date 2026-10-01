"use client";
/**
 * [③] 시험 결과 연출 — 성적표보다 먼저 전체화면으로 CLEAR! / FAILED / PERFECT! 를 보여준다.
 * LIFE 변경 결과와 이전 값을 즉시 보여주며, 다음 화면은 버튼으로 이동한다.
 * onClose 후 페이지가 성적표를 보여주고, runStatus 가 GAME_OVER 면 onGameOver 로 씬으로 보낸다.
 */
import clsx from "clsx";
import { Button } from "@/components/session/ui";
import { CHARACTER_META } from "./characters";
import { JuniorAvatar } from "./JuniorAvatar";
import { LifeHearts } from "./LifeHearts";
import type { JuniorCharacter, LifeResult } from "./types";
import "./game.css";

export function ResultOverlay({
  result,
  character,
  onClose,
  onGameOver,
  final = false,
  onGraduate,
}: {
  result: LifeResult;
  character: JuniorCharacter;
  onClose: () => void;
  onGameOver?: () => void;
  /** 졸업시험 결과면 문구가 바뀌고, 합격 시 [졸업식으로] 버튼이 붙는다 */
  final?: boolean;
  onGraduate?: () => void;
}) {
  const meta = CHARACTER_META[character];
  const gameOver = result.runStatus === "GAME_OVER";
  const kind = result.outcome === "PERFECT" ? "perfect" : result.outcome === "FAILED" ? "failed" : "clear";
  const title = kind === "perfect" ? "PERFECT!" : kind === "failed" ? "FAILED" : "CLEAR!";
  const delta = result.livesAfter - result.livesBefore;
  const message = final
    ? kind === "failed" ? "졸업시험 불합격. 더 가르친 뒤 다시 도전하세요." : "졸업시험 합격! 이제 졸업식을 열 수 있어요."
    : kind === "failed"
      ? "후배가 아직 내용을 충분히 이해하지 못했어요."
      : kind === "perfect"
        ? delta > 0
          ? "완벽한 수업! 후배의 체력이 회복됐어요."
          : "이미 체력이 가득 차 있습니다."
        : result.chapter?.firstClear
          ? "이 챕터를 처음으로 통과했어요!"
          : "합격! 후배가 잘 이해했어요.";

  return (
    <div className="ro-backdrop" role="dialog" aria-modal="true" aria-labelledby="ro-title">
      <div className={clsx("ro-card", `ro-${kind}`)}>
        <div className="ro-card-inner relative px-6 pb-6 pt-8 text-center">
          <div className="mx-auto h-[150px]">
            <JuniorAvatar character={character} size={150} mood={kind === "failed" ? "sad" : "happy"} pose="still" />
          </div>
          {final && <p className="editorial-label mt-3 text-primary">졸업시험</p>}
          <h2 id="ro-title" className="ro-title mt-2 text-5xl sm:text-6xl">{title}</h2>
          <p className="ro-score mt-4 text-4xl font-black tabular-nums">
            {result.score} <span className="text-xl text-muted">/ 100</span>
          </p>
          <p className="ro-line mt-1 text-sm text-muted">
            {meta.name}의 합격 기준 {result.passScore}점 · {kind === "failed" ? "학습 실패" : "합격!"}
          </p>
          <div className="ro-hearts mt-5 flex flex-col items-center gap-2">
            <LifeHearts lives={result.livesAfter} maxLives={result.maxLives} size={34} animate={false} />
            {delta !== 0 && <p className="text-xs text-muted">LIFE {result.livesBefore} → {result.livesAfter} / {result.maxLives}</p>}
            <p className={clsx("text-lg font-black", kind === "failed" ? "text-danger" : delta > 0 ? "text-ok" : "text-muted")}>
              {delta < 0 ? "LIFE −1" : delta > 0 ? "LIFE +1" : kind === "perfect" ? "LIFE MAX" : `LIFE ${result.livesAfter} / ${result.maxLives}`}
            </p>
            <p className="text-sm">{message}</p>
          </div>
          <div className="ro-actions mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {gameOver ? (
              <Button variant="danger" size="lg" onClick={onGameOver ?? onClose}>
                …어?
              </Button>
            ) : (
              <>
                {final && result.canGraduate && onGraduate && <Button size="lg" onClick={onGraduate}>졸업식으로 →</Button>}
                <Button size="lg" variant={final && result.canGraduate && onGraduate ? "secondary" : "primary"} onClick={onClose}>
                  성적표 보기
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
