"use client";
/**
 * 온보딩 4장의 그림. 숫자(합격선 등)는 contracts/game.ts 의 CHARACTERS 를 그대로 쓴다.
 */
import clsx from "clsx";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CHARACTERS, JUNIOR_CHARACTERS, PERFECT_SCORE } from "@/contracts/game";
import { CHARACTER_META, DIFFICULTY_TONE } from "@/components/game/characters";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { LifeHearts } from "@/components/game/LifeHearts";
import { useReducedMotion } from "@/lib/client/preferences";

export type Slide = { id: string; eyebrow: string; title: string; body: string; visual: () => ReactNode };

const step = (i: number) => ({ "--i": i }) as CSSProperties;

function KnowVisual() {
  return (
    <div className="ob-stagger flex w-full flex-col items-center">
      <div style={step(0)}><JuniorAvatar character="MALE_EASY" mood="confused" size={132} /></div>
      <div className="mt-5 grid w-full grid-cols-[2fr_3fr] gap-2.5" style={step(1)}>
        <div className="rounded-2xl border-2 border-primary/30 bg-primary-soft p-3.5">
          <p className="text-xs font-bold text-primary">아는 것</p>
          <p className="mt-1 text-sm font-bold leading-snug">내가 가르친 것</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface p-3.5">
          <p className="text-xs font-bold text-muted">모르는 것</p>
          <p className="mt-1 text-sm font-bold leading-snug">그 밖의 전부</p>
          <span aria-hidden="true" className="absolute right-2 top-1.5 flex gap-1 text-base font-black text-line">
            {[0, 1, 2].map((i) => <span key={i} className="ob-q" style={step(i)}>?</span>)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PickVisual() {
  return (
    <ul className="ob-stagger grid w-full grid-cols-3 gap-2">
      {JUNIOR_CHARACTERS.map((c, i) => {
        const meta = CHARACTER_META[c];
        return (
          <li key={c} className="flex min-w-0 flex-col items-center rounded-2xl px-1 pb-3 pt-4" style={{ ...step(i), background: meta.soft }}>
            <JuniorAvatar character={c} size={96} />
            <p className="mt-2 text-sm font-bold">{meta.name}</p>
            <span className={clsx("mt-1 rounded-full border px-2 py-0.5 text-[11px] font-bold", DIFFICULTY_TONE[meta.difficulty].chip)}>{CHARACTERS[c].label}</span>
            <p className="mt-2 text-[11px] text-muted">합격선</p>
            <p className="text-base font-black tabular-nums" style={{ color: meta.color }}>{CHARACTERS[c].passScore}점</p>
          </li>
        );
      })}
    </ul>
  );
}

/** 하트 데모: 3 → 2(합격선 미만) → 3(100점) 반복. 움직임 줄이기면 멈춘다. */
function LifeVisual() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 1700);
    return () => window.clearInterval(timer);
  }, [reduced]);
  const shownRule: "fail" | "perfect" | null = reduced || tick === 0 ? null : tick % 2 === 1 ? "fail" : "perfect";
  const shownLives = shownRule === "fail" ? 2 : 3;
  return (
    <div className="ob-stagger flex w-full flex-col items-center">
      <div style={step(0)}><JuniorAvatar character="FEMALE_NORMAL" mood={shownRule === "fail" ? "sad" : shownRule === "perfect" ? "happy" : "think"} size={120} /></div>
      <div className="mt-4 w-full rounded-2xl border border-line bg-surface p-4 shadow-card" style={step(1)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-black tracking-wider text-muted">LIFE</span>
          <LifeHearts lives={shownLives} maxLives={3} size={24} label={`LIFE 예시 ${shownLives} / 3`} />
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="ob-rule flex items-center justify-between rounded-xl bg-danger-soft px-3 py-2 text-danger" data-active={shownRule === "fail"}>
            <span className="font-semibold text-ink">합격선 미만</span><b>♥ −1</b>
          </li>
          <li className="ob-rule flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2 text-primary" data-active={shownRule === "perfect"}>
            <span className="font-semibold text-ink">{PERFECT_SCORE}점</span><b>♥ +1</b>
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted">LIFE가 0이 되면 후배가 떠나요.</p>
      </div>
    </div>
  );
}

function GraduateVisual() {
  return (
    <div className="ob-stagger flex items-end justify-center gap-1 pt-6">
      <div style={step(1)}><JuniorAvatar character="MALE_EASY" mood="graduate" size={100} /></div>
      <div style={step(0)}><JuniorAvatar character="KU_HARD" mood="graduate" size={150} /></div>
      <div style={step(2)}><JuniorAvatar character="FEMALE_NORMAL" mood="graduate" size={100} flip /></div>
    </div>
  );
}

export const SLIDES: Slide[] = [
  { id: "know", eyebrow: "가르친 것만 기억해요", title: "후배들은 아무것도 모릅니다", body: "후배는 교재를 미리 읽지 않아요. 선배가 설명한 만큼만 알고, 시험도 그만큼만 풀어요.", visual: KnowVisual },
  { id: "pick", eyebrow: "EASY · NORMAL · HARD", title: "후배를 골라 졸업시키세요", body: "어려운 후배일수록 합격선이 높고 문항이 많아요. 처음이라면 남학생부터 추천해요.", visual: PickVisual },
  { id: "life", eyebrow: "LIFE 규칙", title: "시험은 후배가 봅니다", body: "챕터를 가르치고 나면 후배가 시험을 봐요. 결과에 따라 하트가 줄거나 늘어요.", visual: LifeVisual },
  { id: "graduate", eyebrow: "마지막 관문", title: "모든 챕터를 통과하면 졸업!", body: "챕터 시험을 모두 통과하고 졸업시험까지 붙으면 후배가 졸업해요. 졸업앨범에 사진이 남아요.", visual: GraduateVisual },
];
