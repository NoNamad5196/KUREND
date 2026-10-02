"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePreferences } from "@/lib/client/preferences";
import { CampusScene } from "./Campus";
import "./paper-ending.css";

type Ending = "graduation" | "male" | "female" | "ku";
type Phase = "waiting" | "playing" | "finished";
const DURATION: Record<Ending, number> = { graduation: 3000, male: 3500, female: 3000, ku: 4000 };

/** Presentation only: never changes a run or waits to enable the next action. */
export function PaperEnding({ kind, className, label, children }: {
  kind: Ending;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [reduced, setReduced] = useState(false);
  const [take, setTake] = useState(0);
  const { reduceMotion } = usePreferences();

  useEffect(() => {
    let active = true;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const prefersReduced = () => preference.matches || reduceMotion;
    setReduced(prefersReduced());
    setPhase(prefersReduced() || document.hidden ? "finished" : "waiting");
    const stop = () => setPhase("finished");
    const preferenceChanged = () => {
      setReduced(prefersReduced());
      if (prefersReduced()) stop();
    };
    const visibilityChanged = () => { if (document.hidden) stop(); };
    preference.addEventListener("change", preferenceChanged);
    document.addEventListener("visibilitychange", visibilityChanged);

    // Large original PNGs must be decoded before their short entrance plays.
    // A broken/slow image must never hold the result or navigation hostage.
    const timeout = window.setTimeout(stop, 8000);
    const images = Array.from(root.current?.querySelectorAll("img") ?? []);
    void Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => {
      if (!active) return;
      window.clearTimeout(timeout);
      if (!prefersReduced() && !document.hidden) {
        setPhase((current) => current === "waiting" ? "playing" : current);
      }
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      preference.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [kind, take, reduceMotion]);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setTimeout(() => setPhase("finished"), DURATION[kind]);
    return () => window.clearTimeout(timer);
  }, [kind, phase]);

  return <div ref={root} data-ending-phase={phase}>
    <CampusScene variant={kind === "female" ? "dusk" : "day"} label={label}
      className={`${className} paper-ending paper-ending--${kind} paper-ending--${phase}${reduced ? " paper-ending--reduced" : ""}`}>
      <div className="paper-ending-controls">
        {!reduced && <button type="button" className="paper-ending-control"
          onClick={() => phase === "finished" ? setTake((value) => value + 1) : setPhase("finished")}>
          {phase === "finished" ? "연출 다시 보기" : "연출 건너뛰기"}
        </button>}
      </div>
      {children}
    </CampusScene>
  </div>;
}
