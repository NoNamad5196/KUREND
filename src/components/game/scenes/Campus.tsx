/**
 * [③] 씬 배경 — 가을 캠퍼스 사진(public/characters/bg/campus-autumn.jpg) 위에 낙엽·시간대 톤을 얹는다.
 * variant: day | dusk | night (사진 위 색 오버레이). moving: 트럭이 달릴 때(현재는 낙엽이 더 세게 날린다).
 * 사진 아래 약 15% 가 도로라서 .sc-stage 바닥(14%)에 선 캐릭터·트럭이 길 위에 선다.
 */
import clsx from "clsx";
import type { ReactNode } from "react";
import "../game.css";

const LEAF_COLORS = ["#E8702A", "#F2A541", "#C8402B", "#F6C453", "#B8521E"];

export function Leaves({ count = 26, strong = false }: { count?: number; strong?: boolean }) {
  return (
    <div className="sc-leaves" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 41) % 100}%`,
            background: LEAF_COLORS[i % LEAF_COLORS.length],
            animationDuration: `${(strong ? 5 : 9) + ((i * 7) % 9)}s`,
            animationDelay: `-${(i * 13) % 17}s`,
            width: 10 + ((i * 5) % 8),
            height: 7 + ((i * 3) % 5),
          }}
        />
      ))}
    </div>
  );
}

export function CampusScene({ variant = "day", moving = false, className, children }: { variant?: "day" | "dusk" | "night"; moving?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={clsx("scene", variant === "dusk" && "sc-dusk", variant === "night" && "sc-night", moving && "sc-moving", className)}>
      <div className="sc-photo" aria-hidden="true" />
      <div className="sc-tint" aria-hidden="true" />
      <Leaves strong={moving} />
      {children}
    </div>
  );
}
