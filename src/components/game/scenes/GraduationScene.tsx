"use client";
/**
 * [③] GRADUATION 연출 — 캠퍼스 졸업식. 캐릭터가 학사모·가운·졸업장 차림으로 폴짝, 모자 던지기, 컨페티.
 * "GRADUATION / 드디어 졸업이다! / 축하해~" 뒤에 졸업 결과 카드가 올라온다.
 */
import { useEffect, useState } from "react";
import { TypingText, usePrefersReducedMotion } from "@/components/session/TypingText";
import { CHARACTER_META } from "../characters";
import { GraduationSummary } from "../GraduationSummary";
import { JuniorAvatar } from "../JuniorAvatar";
import { Confetti } from "../ResultOverlay";
import type { GraduationSummary as Summary, JuniorCharacter } from "../types";
import { CampusScene } from "./Campus";

export function GraduationScene({
  character,
  summary,
  nextHref,
  albumHref,
}: {
  character: JuniorCharacter;
  summary: Summary | null;
  nextHref: string;
  albumHref?: string;
}) {
  const meta = CHARACTER_META[character];
  const reduced = usePrefersReducedMotion();
  const [line, setLine] = useState(0);
  const [toss, setToss] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setLine(1), reduced ? 200 : 1800);
    const t2 = window.setTimeout(() => setToss(true), reduced ? 200 : 1200);
    const t3 = window.setTimeout(() => setShowSummary(true), reduced ? 300 : 4200);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [reduced]);
  // 모자 던지기 반복
  useEffect(() => {
    if (!toss || reduced) return;
    const id = window.setInterval(() => { setToss(false); window.setTimeout(() => setToss(true), 50); }, 5200);
    return () => window.clearInterval(id);
  }, [toss, reduced]);

  return (
    <CampusScene variant="day" className="gr">
      <Confetti count={80} />
      <span className="gr-flag" style={{ left: "12%" }} aria-hidden="true" />
      <span className="gr-flag" style={{ right: "12%" }} aria-hidden="true" />
      <div className="sc-text">
        <h1 className="sc-title sc-grad">GRADUATION</h1>
        <div className="sc-line">
          <TypingText key={line} text={meta.graduation.lines[Math.min(line, meta.graduation.lines.length - 1)]} speedMs={50} />
        </div>
      </div>
      <div className="gr-banner">🎓 {meta.name} · 졸업을 축하합니다</div>
      <div className="sc-stage">
        <div className="sc-actor" style={{ left: "50%", transform: "translateX(-50%)" }}>
          <JuniorAvatar character={character} mood="graduate" size={230} toss={toss} />
        </div>
      </div>
      {showSummary && summary && (
        <div className="sc-actions" style={{ bottom: "3%" }}>
          <GraduationSummary summary={summary} nextHref={nextHref} albumHref={albumHref} />
        </div>
      )}
    </CampusScene>
  );
}
