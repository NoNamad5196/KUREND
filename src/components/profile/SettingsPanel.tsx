"use client";
/**
 * 마이페이지 "설정" 본문 — 이 기기(브라우저)에만 저장되는 화면·학습 설정 스위치 목록.
 * 제목·번호는 마이페이지의 archive-section 머리가 맡는다.
 */
import { useId } from "react";
import { setPreference, usePreferences, type PreferenceKey } from "@/lib/client/preferences";
import { Switch } from "./Switch";

const ROWS: Array<{ key: PreferenceKey; label: string; description: string }> = [
  { key: "reduceMotion", label: "움직임 줄이기", description: "캐릭터와 화면 전환 애니메이션을 최소로 줄여요." },
  { key: "instantTyping", label: "타이핑 연출 건너뛰기", description: "후배의 답안과 말이 한 번에 보여요." },
  { key: "examAutoAdvance", label: "시험 문항 자동으로 넘기기", description: "답안을 다 쓰면 다음 문항으로 저절로 넘어가요." },
  { key: "resultSound", label: "결과 효과음", description: "합격·졸업 순간에 짧은 효과음을 들려줘요." },
];

export function SettingsPanel() {
  const prefs = usePreferences();
  const base = useId();
  return (
    <div>
      <ul className="border-t border-ink">
        {ROWS.map(({ key, label, description }) => {
          const id = `${base}-${key}`;
          return (
            <li key={key} className="flex items-center justify-between gap-4 border-b border-line py-4">
              <div className="min-w-0">
                <label htmlFor={id} className="cursor-pointer font-semibold">{label}</label>
                <p id={`${id}-desc`} className="mt-1 text-xs leading-5 text-muted">{description}</p>
              </div>
              <Switch id={id} checked={prefs[key]} describedBy={`${id}-desc`} onChange={(next) => setPreference(key, next)} />
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">설정은 이 기기(브라우저)에만 저장돼요.</p>
    </div>
  );
}
