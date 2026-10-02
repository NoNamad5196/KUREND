"use client";
/** 후배 선택 포스터. Run 생성과 이동은 기존 onSelect 콜백을 사용한다. */
import clsx from "clsx";
import { useState } from "react";
import { Button } from "@/components/session/ui";
import { CHARACTER_META } from "./characters";
import { JuniorAvatar } from "./JuniorAvatar";
import { CHARACTERS, JUNIOR_CHARACTERS, type JuniorCharacter } from "./types";
import { FINAL_QUESTION_COUNT } from "@/contracts/game";
import "./game.css";
import "./editorial.css";

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} / 5`} className="poster-trait-rating">
      {Array.from({ length: 5 }, (_, index) => <i key={index} className={index < value ? "is-filled" : undefined} aria-hidden="true" />)}
    </span>
  );
}

export function JuniorSelect({
  onSelect,
  busy,
  title = "함께 공부할 후배를 골라보세요",
  subtitle = `후배마다 설명하는 방식과 시험 형식이 달라요. 자료와 진도를 유지하면서 후배를 바꿀 수 있어요. 모든 챕터를 통과하면 객관식·서술형 ${FINAL_QUESTION_COUNT}문항의 졸업시험에 도전합니다.`,
}: {
  onSelect: (character: JuniorCharacter) => void | Promise<void>;
  busy?: JuniorCharacter | null;
  title?: string;
  subtitle?: string;
}) {
  const [hover, setHover] = useState<JuniorCharacter | null>(null);
  return (
    <section aria-labelledby="junior-select-heading" className="junior-selection page-enter">
      <header className="junior-selection-heading">
        <div><h1 id="junior-select-heading">{title}</h1></div>
        <p>{subtitle}</p>
      </header>
      <div className="junior-posters">
        {JUNIOR_CHARACTERS.map((key, i) => {
          const meta = CHARACTER_META[key];
          const rule = CHARACTERS[key];
          const active = hover === key;
          return (
            <article
              key={key}
              className={clsx("junior-poster", `junior-poster-${key.toLowerCase()}`, busy === key && "is-selected", active && "is-active")}
              style={{ animationDelay: `${i * 90}ms` }}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(key)}
              onBlur={() => setHover(null)}
            >
              <div className="junior-poster-topline"><span>0{i + 1}</span><span>{meta.difficulty}</span><span aria-hidden="true">↗</span></div>
              <div className="junior-poster-visual">
                <span className="junior-poster-shape" aria-hidden="true" />
                <h2>{meta.name}</h2>
                <JuniorAvatar character={key} size={key === "KU_HARD" ? 240 : 290} pose="still" label={meta.name} />
                <span className="junior-poster-visual-caption">{meta.examLabel}</span>
              </div>
              <div className="junior-poster-copy">
                <h3>{meta.teachLabel}</h3>
                <p className="junior-poster-quote">“{meta.exampleLine}”</p>
                <p className="junior-poster-intro">{meta.intro[0]}<br />{meta.intro[1]}</p>
                <dl className="junior-poster-traits">
                  {(Object.entries(meta.traits) as [string, number][]).map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd><Stars value={v} /></dd></div>
                  ))}
                </dl>
                <div className="junior-poster-exam"><span>{meta.examLabel}</span><span>합격 <b>{rule.passScore}</b>점</span></div>
                <Button className="junior-poster-button w-full" loading={busy === key} disabled={!!busy && busy !== key} onClick={() => void onSelect(key)}>
                  선택하기 <span aria-hidden="true">↗</span>
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
