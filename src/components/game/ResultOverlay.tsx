"use client";
/**
 * [③] 시험 결과 연출 — 성적표보다 먼저 전체화면으로 CLEAR! / FAILED / PERFECT! 를 보여준다.
 * hearts 는 livesBefore → livesAfter 로 잠시 뒤에 바뀌며 깨짐/회복 애니메이션이 돈다.
 * onClose 후 페이지가 성적표를 보여주고, runStatus 가 GAME_OVER 면 onGameOver 로 씬으로 보낸다.
 */
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Button } from "@/components/session/ui";
import { CHARACTER_META } from "./characters";
import { JuniorAvatar } from "./JuniorAvatar";
import { LifeHearts } from "./LifeHearts";
import type { JuniorCharacter, LifeResult } from "./types";
import "./game.css";

const COLORS = ["var(--accent)", "var(--primary)", "var(--line)", "var(--muted)", "var(--surface)", "var(--ok)"];

export function Confetti({ count = 60 }: { count?: number }) {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDuration: `${2.6 + ((i * 7) % 10) / 4}s`,
            animationDelay: `${((i * 13) % 20) / 10}s`,
            width: 6 + ((i * 5) % 7),
            height: 10 + ((i * 3) % 8),
          }}
        />
      ))}
    </div>
  );
}

export function ResultOverlay({
  result,
  character,
  onClose,
  onGameOver,
}: {
  result: LifeResult;
  character: JuniorCharacter;
  onClose: () => void;
  onGameOver?: () => void;
}) {
  const [lives, setLives] = useState(result.livesBefore);
  useEffect(() => {
    const t = window.setTimeout(() => setLives(result.livesAfter), 1300);
    return () => window.clearTimeout(t);
  }, [result.livesAfter]);
  const meta = CHARACTER_META[character];
  const gameOver = result.runStatus === "GAME_OVER";
  const kind = result.outcome === "PERFECT" ? "perfect" : result.outcome === "FAILED" ? "failed" : "clear";
  const title = kind === "perfect" ? "PERFECT!" : kind === "failed" ? "FAILED" : "CLEAR!";
  const delta = result.livesAfter - result.livesBefore;
  const message =
    kind === "failed"
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
      {kind !== "failed" && <Confetti count={kind === "perfect" ? 90 : 40} />}
      <div className={clsx("ro-card", `ro-${kind}`)}>
        <div className="ro-card-inner relative px-6 pb-6 pt-8 text-center">
          <div className="mx-auto h-[150px]">
            <JuniorAvatar character={character} size={150} mood={kind === "failed" ? "sad" : "happy"} pose={kind === "perfect" ? "jump" : undefined} enter />
          </div>
          <h2 id="ro-title" className="ro-title mt-2 text-5xl sm:text-6xl">{title}</h2>
          <p className="ro-score mt-4 text-4xl font-black tabular-nums">
            {result.score} <span className="text-xl text-muted">/ 100</span>
          </p>
          <p className="ro-line mt-1 text-sm text-muted">
            {meta.name}의 합격 기준 {result.passScore}점 · {kind === "failed" ? "학습 실패" : "합격!"}
          </p>
          <div className="ro-hearts mt-5 flex flex-col items-center gap-2">
            <LifeHearts lives={lives} maxLives={result.maxLives} size={34} />
            <p className={clsx("text-lg font-black", kind === "failed" ? "text-danger" : delta > 0 ? "text-ok" : "text-muted")}>
              {delta < 0 ? "LIFE −1" : delta > 0 ? "LIFE +1" : kind === "perfect" ? "LIFE MAX" : `LIFE ${result.livesAfter} / ${result.maxLives}`}
            </p>
            <p className="text-sm">{message}</p>
          </div>
          <div className="ro-actions mt-6 flex justify-center gap-2">
            {gameOver ? (
              <Button variant="danger" size="lg" onClick={onGameOver ?? onClose}>
                …어?
              </Button>
            ) : (
              <Button size="lg" onClick={onClose}>
                성적표 보기
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
