/** A static campus backdrop shared by the departure and graduation screens. */
import clsx from "clsx";
import type { ReactNode } from "react";
import { SCENE_IMAGES } from "@/lib/characters/assets";
import "./static-scenes.css";

export function CampusScene({ variant = "day", className, label = "캠퍼스", children }: {
  variant?: "day" | "dusk" | "night";
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const background = SCENE_IMAGES.campus;
  return (
    <section className={clsx("static-campus", `static-campus-${variant}`, className)} role="dialog" aria-modal="true" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Original supplied backdrop, displayed without generated variants. */}
      <img className="static-campus-background" src={background.src} width={background.width} height={background.height} alt="" aria-hidden="true" draggable={false} />
      <div className="static-campus-content">{children}</div>
    </section>
  );
}
