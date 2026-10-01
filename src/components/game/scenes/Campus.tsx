/**
 * [③] 씬 배경 — 하늘·구름·캠퍼스 건물·나무·길. variant: day | dusk | night. moving: 길 점선이 흐른다(차가 달릴 때).
 */
import clsx from "clsx";
import type { ReactNode } from "react";
import "../game.css";

export function CampusScene({ variant = "day", moving = false, className, children }: { variant?: "day" | "dusk" | "night"; moving?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={clsx("scene", variant === "dusk" && "sc-dusk", variant === "night" && "sc-night", moving && "sc-moving", className)}>
      <div className="sc-sky" aria-hidden="true" />
      <span className="sc-cloud" style={{ animationDuration: "48s", animationDelay: "-10s", opacity: 0.9 }} aria-hidden="true" />
      <span className="sc-cloud" style={{ animationDuration: "70s", animationDelay: "-40s", top: "16%", transform: "scale(.7)", opacity: 0.7 }} aria-hidden="true" />
      <div className="sc-bg" aria-hidden="true">
        <svg viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice">
          {/* 멀리 언덕 */}
          <path d="M0 300 Q 200 230 420 280 T 820 270 T 1200 290 V400 H0 Z" fill="#C9D9C4" />
          {/* 본관 */}
          <g>
            <rect x="420" y="120" width="360" height="190" rx="6" fill="#E8DCC8" stroke="#8B7355" strokeWidth="4" />
            <rect x="570" y="40" width="60" height="90" fill="#E8DCC8" stroke="#8B7355" strokeWidth="4" />
            <path d="M560 42 L600 10 L640 42 Z" fill="#1F6F5B" stroke="#163F2A" strokeWidth="4" strokeLinejoin="round" />
            <circle cx="600" cy="80" r="16" fill="#FBF7EA" stroke="#8B7355" strokeWidth="3" />
            <path d="M600 80 v-10 M600 80 h7" stroke="#8B7355" strokeWidth="3" strokeLinecap="round" />
            <path d="M410 122 h380" stroke="#1F6F5B" strokeWidth="10" />
            {Array.from({ length: 6 }, (_, i) => (
              <rect key={i} x={448 + i * 52} y="150" width="28" height="40" rx="3" fill="#8FD0F0" stroke="#8B7355" strokeWidth="3" />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <rect key={i} x={448 + i * 52} y="215" width="28" height="40" rx="3" fill="#8FD0F0" stroke="#8B7355" strokeWidth="3" />
            ))}
            <rect x="575" y="250" width="50" height="60" rx="4" fill="#5A3E24" stroke="#8B7355" strokeWidth="3" />
            <path d="M540 312 h120 v-12 h-120 z" fill="#C9C3B2" stroke="#8B7355" strokeWidth="3" />
          </g>
          {/* 정문 */}
          <g>
            <rect x="120" y="200" width="26" height="110" fill="#8B7355" />
            <rect x="250" y="200" width="26" height="110" fill="#8B7355" />
            <path d="M110 200 h176 v-18 h-176 z" fill="#1F6F5B" />
            <text x="198" y="196" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" fontFamily="Arial Black, sans-serif">KU</text>
          </g>
          {/* 나무들 */}
          {[60, 340, 880, 1000, 1120].map((x, i) => (
            <g key={x} transform={`translate(${x} ${300 - (i % 2) * 10})`}>
              <rect x="-7" y="-10" width="14" height="40" fill="#8B5E34" />
              <circle cx="0" cy="-40" r="38" fill={i % 2 ? "#5E9E6A" : "#4C8A58"} stroke="#2F5A3A" strokeWidth="4" />
              <circle cx="-22" cy="-24" r="24" fill={i % 2 ? "#5E9E6A" : "#4C8A58"} stroke="#2F5A3A" strokeWidth="4" />
              <circle cx="22" cy="-22" r="22" fill={i % 2 ? "#5E9E6A" : "#4C8A58"} stroke="#2F5A3A" strokeWidth="4" />
            </g>
          ))}
        </svg>
      </div>
      <div className="sc-ground" aria-hidden="true" />
      <div className="sc-road" aria-hidden="true" />
      {children}
    </div>
  );
}
