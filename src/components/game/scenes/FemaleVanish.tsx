import type { CSSProperties } from "react";
import { JuniorAvatar } from "../JuniorAvatar";

/**
 * 컴순이 졸업 실패: 몇 걸음 옆으로 가더니 이쪽을 한 번 보고, 종이 인형이 옆으로 접히듯 사라진다.
 * 사라진 자리에서 낙엽 몇 장이 흩어진다 — "컴순이가 어디로 갔지?" 문구는 그대로다.
 */
const LEAVES = [
  { x: "38%", y: "62%", dx: "-52px", dy: "38px", turn: "-160deg", wait: "0ms" },
  { x: "52%", y: "48%", dx: "44px", dy: "52px", turn: "140deg", wait: "60ms" },
  { x: "60%", y: "70%", dx: "58px", dy: "18px", turn: "-90deg", wait: "120ms" },
  { x: "44%", y: "36%", dx: "-30px", dy: "70px", turn: "200deg", wait: "40ms" },
  { x: "48%", y: "80%", dx: "-64px", dy: "12px", turn: "110deg", wait: "180ms" },
  { x: "56%", y: "28%", dx: "36px", dy: "84px", turn: "-220deg", wait: "90ms" },
  { x: "40%", y: "50%", dx: "-46px", dy: "60px", turn: "80deg", wait: "150ms" },
  { x: "64%", y: "56%", dx: "66px", dy: "40px", turn: "-130deg", wait: "30ms" },
  { x: "50%", y: "90%", dx: "12px", dy: "28px", turn: "170deg", wait: "210ms" },
  { x: "58%", y: "42%", dx: "50px", dy: "66px", turn: "-70deg", wait: "240ms" },
];

export function FemaleVanish() {
  return <div className="static-departure-art paper-departure-stage paper-female-stage">
    <div className="static-departure-person paper-exit-person paper-female-person">
      <div className="paper-puppet paper-female-puppet">
        <div className="paper-facing paper-facing-front">
          <JuniorAvatar character="FEMALE_NORMAL" outfit="casual" view="front" pose="still" size={220} className="static-scene-avatar" />
        </div>
        <div className="paper-facing paper-facing-side" aria-hidden="true">
          <JuniorAvatar character="FEMALE_NORMAL" outfit="casual" view="side" pose="still" size={220} className="static-scene-avatar" />
        </div>
      </div>
      <div className="paper-leaves" aria-hidden="true">
        {LEAVES.map((leaf, index) => (
          <i key={index} style={{ "--leaf-x": leaf.x, "--leaf-y": leaf.y, "--leaf-dx": leaf.dx, "--leaf-dy": leaf.dy, "--leaf-turn": leaf.turn, "--leaf-wait": leaf.wait } as CSSProperties} />
        ))}
      </div>
    </div>
  </div>;
}
