"use client";

import { useId } from "react";
import { setPreference, useApplyPreferences, usePreferences, type PreferenceKey } from "@/lib/client/preferences";
import { resetOnboarding } from "@/components/onboarding/Onboarding";
import { Button, Card } from "@/components/shell/ui";
import { Switch } from "./Switch";
import "./reduce-motion.css";

const ROWS: Array<{ key: PreferenceKey; label: string; description: string }> = [
  { key: "reduceMotion", label: "움직임 줄이기", description: "캐릭터와 화면 전환 애니메이션을 최소로 줄여요." },
  { key: "instantTyping", label: "타이핑 연출 건너뛰기", description: "후배의 답안과 말이 한 번에 보여요." },
  { key: "examAutoAdvance", label: "시험 문항 자동으로 넘기기", description: "답안을 다 쓰면 다음 문항으로 저절로 넘어가요." },
  { key: "resultSound", label: "결과 효과음", description: "합격·졸업 순간에 짧은 효과음을 들려줘요." },
];

export function SettingsPanel() {
  const prefs = usePreferences();
  useApplyPreferences(); // 온보딩이 아직 전역에 없더라도 이 화면에서는 반영
  const base = useId();
  return (
    <section aria-labelledby={`${base}-heading`}>
      <h2 id={`${base}-heading`} className="mb-3 text-lg font-bold">설정</h2>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {ROWS.map(({ key, label, description }) => {
            const id = `${base}-${key}`;
            return (
              <li key={key} className="flex items-center justify-between gap-3 py-3 pl-5 pr-3">
                <div className="min-w-0">
                  <label htmlFor={id} className="cursor-pointer font-semibold">{label}</label>
                  <p id={`${id}-desc`} className="mt-0.5 text-xs text-muted">{description}</p>
                </div>
                <Switch id={id} checked={prefs[key]} describedBy={`${id}-desc`} onChange={(next) => setPreference(key, next)} />
              </li>
            );
          })}
          <li className="flex items-center justify-between gap-3 py-3 pl-5 pr-4">
            <div className="min-w-0">
              <p className="font-semibold">온보딩 다시 보기</p>
              <p className="mt-0.5 text-xs text-muted">처음 안내 4장을 다시 볼 수 있어요.</p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={() => resetOnboarding()}>다시 보기</Button>
          </li>
        </ul>
      </Card>
      <p className="mt-2 text-xs text-muted">설정은 이 기기(브라우저)에만 저장돼요.</p>
    </section>
  );
}
