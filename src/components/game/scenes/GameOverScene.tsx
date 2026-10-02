"use client";

import clsx from "clsx";
import { Button } from "@/components/session/ui";
import { CHARACTER_META } from "../characters";
import { JuniorAvatar } from "../JuniorAvatar";
import type { JuniorCharacter } from "../types";
import { CampusScene } from "./Campus";
import { ArmyTruck, PickupTruck } from "./Trucks";

/** The existing departure story, presented immediately as a still composition. */
export function GameOverScene({ character, onNext, nextLabel = "새 후배 만나기" }: {
  character: JuniorCharacter;
  onNext: () => void;
  nextLabel?: string;
}) {
  const meta = CHARACTER_META[character];
  const male = character === "MALE_EASY";
  const female = character === "FEMALE_NORMAL";
  return (
    <CampusScene variant={female ? "dusk" : "day"} className="static-game-over" label="게임 오버">
      <header className="static-scene-heading">
        <p className="static-scene-eyebrow">새내기 / {meta.name}</p>
        <h1>게임 오버</h1>
        <div className="static-scene-story">
          {meta.gameOver.lines.map((line) => <p key={line}>{line}</p>)}
        </div>
      </header>
      <div className={clsx("static-departure-art", !female && "static-departure-with-vehicle")}>
        <div className="static-departure-person">
          <JuniorAvatar character={character} outfit={male ? "soldiers" : female ? "casual" : "default"} view="side" pose="still" size={220} className="static-scene-avatar" />
        </div>
        {!female && (male ? <ArmyTruck /> : <PickupTruck />)}
      </div>
      <footer className="static-scene-next">
        <p>{meta.gameOver.after}</p>
        <Button size="lg" onClick={onNext}>{nextLabel} →</Button>
      </footer>
    </CampusScene>
  );
}
