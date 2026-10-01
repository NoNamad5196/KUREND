import clsx from "clsx";
import type { CSSProperties } from "react";
import { SCENE_IMAGES } from "@/lib/characters/assets";
import "./static-scenes.css";

type TruckProps = { className?: string; style?: CSSProperties };

/** Transparent outer padding is normalized; the supplied truck itself stays whole. */
function Truck({ kind, className, style }: TruckProps & { kind: "ku-truck" | "military-truck" }) {
  const asset = SCENE_IMAGES[kind];
  const [left, top, width, height] = asset.bounds;
  return (
    <span className={clsx("static-truck", className)} style={{ aspectRatio: `${width} / ${height}`, ...style }} data-vehicle={kind}>
      {/* eslint-disable-next-line @next/next/no-img-element -- A single unchanged source PNG, including its original wheels. */}
      <img
        src={asset.src}
        width={asset.width}
        height={asset.height}
        alt={kind === "military-truck" ? "군용 트럭" : "일반 트럭"}
        draggable={false}
        style={{ width: `${asset.width / width * 100}%`, height: `${asset.height / height * 100}%`, left: `${-left / width * 100}%`, top: `${-top / height * 100}%` }}
      />
    </span>
  );
}

export function PickupTruck(props: TruckProps) {
  return <Truck kind="ku-truck" {...props} />;
}

export function ArmyTruck(props: TruckProps) {
  return <Truck kind="military-truck" {...props} />;
}
