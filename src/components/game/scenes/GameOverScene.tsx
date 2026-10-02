"use client";

import clsx from "clsx";
import { Button } from "@/components/session/ui";
import { CHARACTER_META } from "../characters";
import { JuniorAvatar } from "../JuniorAvatar";
import type { JuniorCharacter } from "../types";
import { PaperEnding } from "./PaperEnding";
import { ArmyTruck } from "./Trucks";
import { KuTruckDeparture } from "./KuTruckDeparture";
import { FemaleVanish } from "./FemaleVanish";

/** Whole PNGs rock and travel like paper puppets; the departure story stays intact. */
export function GameOverScene({ character, onNext, nextLabel = "새 후배 만나기" }: {
  character: JuniorCharacter;
  onNext: () => void;
  nextLabel?: string;
}) {
  const meta = CHARACTER_META[character];
  const male = character === "MALE_EASY";
  const female = character === "FEMALE_NORMAL";
  return (
    <PaperEnding key={character} kind={male ? "male" : female ? "female" : "ku"} className="static-game-over" label="졸업 실패">
      <header className="static-scene-heading">
        <p className="static-scene-eyebrow">새내기 / {meta.name}</p>
        <h1>졸업 실패</h1>
        <div className="static-scene-story">
          {meta.gameOver.lines.map((line) => <p key={line}>{line}</p>)}
        </div>
      </header>
      {female ? <FemaleVanish /> : !male ? <KuTruckDeparture /> : <div className={clsx("static-departure-art paper-departure-stage", "static-departure-with-vehicle")}>
        <div className="static-departure-person paper-exit-person">
          <div className="paper-puppet">
            <div className="paper-facing paper-facing-front">
              <JuniorAvatar character={character} outfit="soldiers" view="front" pose="still" size={220} className="static-scene-avatar" />
            </div>
            <div className="paper-facing paper-facing-side" aria-hidden="true">
              <JuniorAvatar character={character} outfit="soldiers" view="side" pose="still" size={220} className="static-scene-avatar" />
            </div>
          </div>
        </div>
        <ArmyTruck className="paper-truck" />
      </div>}
      <footer className="static-scene-next">
        <p>{meta.gameOver.after}</p>
        <Button size="lg" onClick={onNext}>{nextLabel} →</Button>
      </footer>
    </PaperEnding>
  );
}
