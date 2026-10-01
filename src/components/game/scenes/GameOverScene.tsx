"use client";
/**
 * [③] GAME OVER 캐릭터 이벤트. 캐릭터별 연출:
 *  KU        — 캠퍼스 앞 작은 트럭. KU 가 걸어가 트럭 뒤에 타고, 트럭이 천천히 떠난다.
 *  남학생    — 군용 두돈반이 들어오고, 군복 차림(동료와 함께)으로 걸어가 뒤돌아 손 흔들고 탑승, 출발.
 *  여학생    — 아무 일도 없다. 그냥 멀리 걸어가 점점 작아진다.
 * 그 다음 빈 캠퍼스 → "새로운 후배가 찾아왔어요." → onNext (후배 선택으로). 톤은 어이없고 웃픈 쪽.
 * phases: title → lines(걷기) → wave(남학생) → leave → quiet → next. 건너뛰기는 바로 next.
 */
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/session/ui";
import { TypingText, usePrefersReducedMotion } from "@/components/session/TypingText";
import { CHARACTER_META } from "../characters";
import { JuniorAvatar } from "../JuniorAvatar";
import type { JuniorCharacter } from "../types";
import { CampusScene } from "./Campus";
import { ArmyTruck, PickupTruck } from "./Trucks";

type Phase = "title" | "lines" | "wave" | "leave" | "quiet" | "next";

const TIMING: Record<JuniorCharacter, Partial<Record<Phase, number>>> = {
  KU_HARD: { title: 1400, lines: 5200, leave: 4200, quiet: 1800 },
  MALE_EASY: { title: 1400, lines: 5600, wave: 1500, leave: 4200, quiet: 1800 },
  FEMALE_NORMAL: { title: 1400, lines: 6200, leave: 600, quiet: 2400 },
};

export function GameOverScene({
  character,
  onNext,
  nextLabel = "새 후배 만나기",
}: {
  character: JuniorCharacter;
  onNext: () => void;
  nextLabel?: string;
}) {
  const meta = CHARACTER_META[character];
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("title");
  const [lineIndex, setLineIndex] = useState(0);
  const order = useMemo<Phase[]>(() => (character === "MALE_EASY" ? ["title", "lines", "wave", "leave", "quiet", "next"] : ["title", "lines", "leave", "quiet", "next"]), [character]);

  useEffect(() => {
    if (phase === "next") return;
    const ms = reduced ? 300 : (TIMING[character][phase] ?? 1000);
    const t = window.setTimeout(() => setPhase(order[order.indexOf(phase) + 1] ?? "next"), ms);
    return () => window.clearTimeout(t);
  }, [phase, character, order, reduced]);

  // 대사는 lines 단계부터 한 줄씩, leave/quiet 에서도 남은 줄을 이어서 보여준다.
  useEffect(() => {
    if (phase === "title") return;
    if (lineIndex >= meta.gameOver.lines.length) return;
    const t = window.setTimeout(() => setLineIndex((i) => i + 1), reduced ? 200 : 1500);
    return () => window.clearTimeout(t);
  }, [phase, lineIndex, meta.gameOver.lines.length, reduced]);

  const gone = phase === "quiet" || phase === "next";
  const walking = phase === "lines";
  const leaving = phase === "leave";
  const male = character === "MALE_EASY";
  const female = character === "FEMALE_NORMAL";
  const actorMood = phase === "title" ? "sad" : "idle";

  return (
    <CampusScene variant={female ? "dusk" : "day"} moving={leaving} className={clsx(male ? "go-male" : female ? "go-female" : "go-ku", leaving && "go-leave")}>
      <button type="button" className="sc-skip underline" onClick={onNext}>건너뛰기</button>
      <div className="sc-text">
        <h1 className="sc-title sc-over">{meta.gameOver.title}</h1>
        <div className="sc-line">
          {phase !== "title" && lineIndex < meta.gameOver.lines.length && (
            <TypingText key={lineIndex} text={meta.gameOver.lines[lineIndex]} speedMs={45} cursor />
          )}
          {gone && lineIndex >= meta.gameOver.lines.length && phase === "next" && (
            <TypingText text={meta.gameOver.after} speedMs={40} className="font-black text-primary" />
          )}
        </div>
      </div>

      <div className="sc-stage">
        {/* 트럭 */}
        {!female && (male ? (
          <ArmyTruck rolling={phase === "title" || phase === "lines" ? false : true} style={{ right: undefined }} />
        ) : (
          <PickupTruck rolling={leaving} />
        ))}
        {/* 캐릭터 */}
        {!gone && (
          <div className="sc-actor" style={{ left: female ? "38%" : "8%", ["--go-dx" as string]: male ? "48vw" : "46vw" }}>
            {male ? (
              phase === "wave" ? (
                <JuniorAvatar character={character} outfit="soldiers" view="front" size={200} pose="wave" mood="happy" />
              ) : (
                <JuniorAvatar character={character} outfit="soldiers" view="side" size={200} pose={walking ? "walk" : "still"} mood={actorMood} flip />
              )
            ) : female ? (
              <JuniorAvatar character={character} outfit="casual" view="back" size={200} pose="walk" mood="idle" />
            ) : (
              <JuniorAvatar character={character} size={190} pose={walking ? "walk" : "still"} mood={phase === "title" ? "confused" : "idle"} />
            )}
            {walking && <span className="sc-dust" style={{ left: -6 }} aria-hidden="true" />}
          </div>
        )}
      </div>

      {phase === "next" && (
        <div className="sc-actions">
          <Button size="lg" onClick={onNext}>{nextLabel} →</Button>
        </div>
      )}
    </CampusScene>
  );
}
