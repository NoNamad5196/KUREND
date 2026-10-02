"use client";

import Link from "next/link";
import { Button } from "@/components/session/ui";
import { CHARACTER_META } from "../characters";
import { GraduationSummary } from "../GraduationSummary";
import { JuniorAvatar } from "../JuniorAvatar";
import { withJosa } from "../JuniorOrMascot";
import type { GraduationSummary as Summary, JuniorCharacter } from "../types";
import { CampusScene } from "./Campus";

/** Graduation art and the existing result card are visible immediately. */
export function GraduationScene({ character, summary, nextHref, albumHref }: {
  character: JuniorCharacter;
  summary: Summary | null;
  nextHref: string;
  albumHref?: string;
}) {
  const meta = CHARACTER_META[character];
  return (
    <CampusScene className="static-graduation" label="졸업식">
      <header className="static-scene-heading">
        <p className="static-scene-eyebrow">새내기 / {meta.name}</p>
        <h1>졸업식</h1>
        <p className="static-graduation-message">{meta.graduation.lines.join(" ")}</p>
      </header>
      <div className="static-graduation-content">
        <div className="static-graduation-portrait">
          <JuniorAvatar character={character} outfit="grad" view="front" pose="still" size={300} className="static-scene-avatar" label={`${meta.name}의 졸업식`} />
        </div>
        <div className="static-graduation-record">
          {summary ? (
            <GraduationSummary summary={summary} nextHref={nextHref} albumHref={albumHref} />
          ) : (
            <div className="static-graduation-fallback">
              <p className="text-xl font-semibold">{withJosa(meta.name, "이/가")} 졸업했습니다!</p>
              <p className="text-sm text-muted">졸업 기록을 불러오지 못했지만, 새로운 후배를 만날 수 있어요.</p>
              {albumHref && <Link href={albumHref}><Button variant="secondary" className="w-full">졸업 기록 보기</Button></Link>}
              <Link href={nextHref}><Button className="w-full">새로운 후배 만나기 →</Button></Link>
            </div>
          )}
        </div>
      </div>
    </CampusScene>
  );
}
