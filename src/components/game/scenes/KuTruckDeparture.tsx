import { JuniorAvatar } from "../JuniorAvatar";
import { PickupTruck } from "./Trucks";

/** The rider and truck share one coordinate system, including the drive away. */
export function KuTruckDeparture() {
  return <div className="static-departure-art paper-departure-stage paper-ku-stage">
    <div className="paper-ku-convoy">
      <div className="paper-ku-rider">
        <div className="paper-ku-tumble">
          <JuniorAvatar character="KU_HARD" view="front" pose="still" size={220} className="static-scene-avatar" />
        </div>
      </div>
      <PickupTruck className="paper-ku-vehicle" />
    </div>
  </div>;
}
