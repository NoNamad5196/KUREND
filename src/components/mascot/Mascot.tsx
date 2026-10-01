/**
 * §8-14 마스코트 — KU 황소 캐릭터. 상태별 표정/소품/모션은 mascot.css 가 담당한다.
 * props: state, size(px), typing("…" 인디케이터), className, label(aria-label)
 */
import clsx from "clsx";
import { MASCOT_SVG, MASCOT_VIEWBOX } from "./mascot-svg";
import "./mascot.css";

export type MascotState = "idle" | "thinking" | "doubt" | "writing" | "praise" | "cheer" | "encourage";

export function Mascot({
  state = "idle",
  size = 120,
  typing = false,
  className,
  label = "새내기",
}: {
  state?: MascotState;
  size?: number;
  typing?: boolean;
  className?: string;
  label?: string;
}) {
  const height = Math.round(size * (270 / 240));
  return (
    <span
      role="img"
      aria-label={label}
      className={clsx("ku-mascot", `ku-state-${state}`, className)}
      style={{ width: size, height }}
      data-state={state}
    >
      <svg viewBox={MASCOT_VIEWBOX} xmlns="http://www.w3.org/2000/svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MASCOT_SVG }} />
      {typing && (
        <span className="ku-typing" aria-label="입력 중">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
