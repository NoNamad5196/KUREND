"use client";
/**
 * [③] 후배 선택 — "이번에는 어떤 후배를 졸업시켜볼까요?" 카드 3장. onSelect(character) 로 Run 생성은 페이지가 담당.
 */
import clsx from "clsx";
import { useState } from "react";
import { Button, Card } from "@/components/session/ui";
import { CHARACTER_META, DIFFICULTY_TONE } from "./characters";
import { JuniorAvatar } from "./JuniorAvatar";
import { CHARACTERS, JUNIOR_CHARACTERS, type JuniorCharacter } from "./types";
import "./game.css";

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} / 5`} className="tracking-tight text-accent">
      {"★".repeat(value)}
      <span className="text-line">{"★".repeat(5 - value)}</span>
    </span>
  );
}

export function JuniorSelect({
  onSelect,
  busy,
  title = "이번에는 어떤 후배를 졸업시켜볼까요?",
  subtitle = "후배마다 이해 방식·되묻기·시험 형식·문항 수·합격선이 다릅니다. 자료와 진도를 유지하면서 후배를 바꿀 수 있어요. 모든 챕터를 통과하고 졸업시험(객관식+서술형 10문항)에 붙으면 졸업합니다.",
}: {
  onSelect: (character: JuniorCharacter) => void | Promise<void>;
  busy?: JuniorCharacter | null;
  title?: string;
  subtitle?: string;
}) {
  const [hover, setHover] = useState<JuniorCharacter | null>(null);
  return (
    <section aria-labelledby="junior-select-heading" className="space-y-6">
      <div className="text-center">
        <h1 id="junior-select-heading" className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">{subtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {JUNIOR_CHARACTERS.map((key, i) => {
          const meta = CHARACTER_META[key];
          const rule = CHARACTERS[key];
          const tone = DIFFICULTY_TONE[meta.difficulty];
          const active = hover === key;
          return (
            <Card
              key={key}
              className={clsx("js-card flex flex-col items-center p-5 text-center", busy === key && "js-selected")}
              style={{ animationDelay: `${i * 120}ms` }}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="relative mt-1 h-[170px]">
                <JuniorAvatar character={key} size={170} mood={active ? "happy" : "idle"} enter label={meta.name} />
              </div>
              <h2 className="mt-3 text-xl font-black">{meta.name}</h2>
              <span className={clsx("mt-1 rounded-full border px-2.5 py-0.5 text-xs font-black tracking-widest", tone.chip)}>{meta.difficulty}</span>
              <p className="mt-3 text-sm font-semibold leading-6">
                {meta.intro[0]}
                <br />
                {meta.intro[1]}
              </p>
              <dl className="mt-4 w-full space-y-1 text-xs text-muted">
                {(Object.entries(meta.traits) as [string, number][]).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <dt>{k}</dt>
                    <dd><Stars value={v} /></dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-muted">{meta.examLabel} · 합격 {rule.passScore}점</p>
              <Button className="mt-4 w-full" loading={busy === key} disabled={!!busy && busy !== key} onClick={() => void onSelect(key)}>
                선택하기
              </Button>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
