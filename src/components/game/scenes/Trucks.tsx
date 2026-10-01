/**
 * [③] 트럭 SVG 두 종 — KU 용 작은 트럭, 남학생 용 군용 두돈반. rolling 이면 바퀴가 돌고 매연이 나온다.
 */
import clsx from "clsx";

function Smoke() {
  return (
    <>
      <circle className="smoke smoke-1" cx="18" cy="118" r="8" fill="#9AA0A6" />
      <circle className="smoke smoke-2" cx="14" cy="112" r="10" fill="#B4B9BE" />
      <circle className="smoke smoke-3" cx="20" cy="108" r="7" fill="#C9CDD1" />
    </>
  );
}

function Wheel({ cx, cy, r = 24, dark = "#2A2D33" }: { cx: number; cy: number; r?: number; dark?: string }) {
  return (
    <g className="wheel" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <circle cx={cx} cy={cy} r={r} fill={dark} stroke="#15171B" strokeWidth="4" />
      <circle cx={cx} cy={cy} r={r * 0.5} fill="#C9CDD1" stroke="#15171B" strokeWidth="3" />
      <path d={`M${cx - r * 0.5} ${cy} h${r} M${cx} ${cy - r * 0.5} v${r}`} stroke="#15171B" strokeWidth="3" />
    </g>
  );
}

export function PickupTruck({ rolling, className, style }: { rolling?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={clsx("sc-truck", rolling && "sc-rolling", className)} style={style} aria-label="트럭" role="img">
      <svg viewBox="0 0 340 180">
        <Smoke />
        <g className="bed">
          <rect x="30" y="70" width="170" height="60" rx="6" fill="#F4B942" stroke="#5A4420" strokeWidth="4" />
          <path d="M30 70 h170" stroke="#5A4420" strokeWidth="6" />
          <rect x="40" y="52" width="150" height="24" rx="4" fill="#E9A92A" stroke="#5A4420" strokeWidth="3" />
        </g>
        <g className="cab">
          <path d="M200 130 v-70 h60 l40 40 v30 z" fill="#1F6F5B" stroke="#163F2A" strokeWidth="4" strokeLinejoin="round" />
          <path d="M212 70 h44 l26 30 h-70 z" fill="#8FD0F0" stroke="#163F2A" strokeWidth="3" strokeLinejoin="round" />
          <rect x="296" y="108" width="14" height="10" rx="2" fill="#FFF4D6" stroke="#163F2A" strokeWidth="2" />
          <rect x="20" y="124" width="300" height="14" rx="5" fill="#2A2D33" />
        </g>
        <Wheel cx={70} cy={140} />
        <Wheel cx={250} cy={140} />
      </svg>
    </div>
  );
}

export function ArmyTruck({ rolling, className, style }: { rolling?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={clsx("sc-truck", rolling && "sc-rolling", className)} style={{ width: 420, height: 200, ...style }} aria-label="군용 트럭" role="img">
      <svg viewBox="0 0 420 200">
        <Smoke />
        <g className="bed">
          <rect x="20" y="40" width="250" height="100" rx="8" fill="#4F5B3A" stroke="#2A311F" strokeWidth="4" />
          <path d="M20 40 q125 -24 250 0" fill="#5E6B46" stroke="#2A311F" strokeWidth="4" />
          <path d="M60 40 v100 M120 40 v100 M180 40 v100 M240 40 v100" stroke="#2A311F" strokeWidth="2.5" opacity=".5" />
          <rect x="24" y="112" width="242" height="26" fill="#6A7650" stroke="#2A311F" strokeWidth="3" />
        </g>
        <g className="cab">
          <path d="M270 140 v-76 h70 l44 44 v32 z" fill="#5E6B46" stroke="#2A311F" strokeWidth="4" strokeLinejoin="round" />
          <path d="M282 72 h50 l30 32 h-80 z" fill="#8FD0F0" stroke="#2A311F" strokeWidth="3" strokeLinejoin="round" />
          <path d="M292 76 l30 0" stroke="#fff" strokeWidth="3" opacity=".6" />
          <rect x="380" y="118" width="14" height="10" rx="2" fill="#FFF4D6" stroke="#2A311F" strokeWidth="2" />
          <rect x="10" y="134" width="396" height="16" rx="5" fill="#2A2D33" />
          <text x="330" y="132" fontSize="12" fontWeight="900" fill="#F4F1E6" fontFamily="Arial Black, sans-serif">ROKA</text>
        </g>
        <Wheel cx={70} cy={160} r={28} />
        <Wheel cx={150} cy={160} r={28} />
        <Wheel cx={330} cy={160} r={28} />
      </svg>
    </div>
  );
}
