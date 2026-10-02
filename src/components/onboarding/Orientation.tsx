"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { api } from "@/lib/client/api";
import { useCurrentUser } from "@/components/shell/AppShell";
import { Button, Chip } from "@/components/shell/ui";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { JuniorTrio } from "@/components/game/JuniorTrio";
import { CHARACTER_META } from "@/components/game/characters";
import { CHARACTERS, JUNIOR_CHARACTERS, type JuniorCharacter } from "@/contracts/game";
import "./orientation.css";

const STEPS = ["선배가 되어 보기", "가르친 만큼만", "나와 맞는 후배", "졸업까지 함께"];
const TITLES = [
  "여기서는 당신이 선배입니다.",
  <span key="taught"><span className="ko-title-line">후배는 가르친만큼만</span><br />압니다.</span>,
  <span key="method"><span className="ko-title-line">후배 선택은 학습방식</span><br />선택입니다.</span>,
  "가르치고, 돌아보고, 다시 가르쳐요.",
];
const FLOW = [
  { icon: "＋", label: "자료 올리기", detail: "AI가 목차로 정리" },
  { icon: "☺", label: "후배 선택", detail: "나에게 맞는 학습 방식" },
  { icon: "✎", label: "직접 가르치기", detail: "내 말로 설명하기" },
  { icon: "▤", label: "후배 시험", detail: "가르친 내용으로만 답하기" },
  { icon: "↺", label: "오답 확인", detail: "내 설명의 빈틈 발견" },
  { icon: "↗", label: "다시 가르치기", detail: "노트를 보고 반복 학습" },
  { icon: "🎓", label: "후배 졸업", detail: "함께 쌓은 이해의 기록" },
];

function CharacterLesson() {
  const [character, setCharacter] = useState<JuniorCharacter>("MALE_EASY");
  const meta = CHARACTER_META[character];
  const rule = CHARACTERS[character];
  return <div className="ko-character-lesson">
    <div className="ko-character-tabs" role="group" aria-label="후배별 학습 방식 둘러보기">
      {JUNIOR_CHARACTERS.map((key, index) => <button key={key} type="button" aria-pressed={character === key} onClick={() => setCharacter(key)} className={clsx(character === key && "is-active")}><span>0{index + 1}</span>{CHARACTER_META[key].name}<span className="ko-tab-arrow" aria-hidden="true">↗</span></button>)}
    </div>
    <div className="ko-character-feature" aria-live="polite" aria-atomic="true">
      <div className="ko-character-poster">
        <span className="editorial-label">난이도 · {rule.label === "EASY" ? "쉬움" : rule.label === "NORMAL" ? "보통" : "어려움"}</span>
        <span className="ko-character-name" aria-hidden="true">{meta.name}</span>
        <JuniorAvatar key={character} character={character} size={270} mood="idle" enter />
        <p>{meta.examLabel}<span>합격 {rule.passScore}점</span></p>
      </div>
      <div className="ko-character-detail">
        <h2>{meta.teachLabel}</h2>
        <blockquote>“{character === "MALE_EASY" ? "가격이 오르면 수요량은 어떻게 됩니까?" : meta.exampleLine}”</blockquote>
        {character === "MALE_EASY" ? <div>
          <div className="ko-choice-examples" aria-label="선택형 가르치기 예시">
            {["늘어난다고 알려주기", "줄어든다고 알려주기", "그대로라고 알려주기", "잘 모르겠다고 말하기"].map((choice, index) => <span key={choice}><span>0{index + 1}</span>{choice}</span>)}
          </div>
          <p className="ko-lesson-note">내가 알려줄 내용을 고르거나 직접 설명해요. 잘못 가르치면 후배도 잘못 배울 수 있어요.</p>
        </div> : <p className="ko-lesson-note">{character === "FEMALE_NORMAL" ? "왜 그런지, 어떤 의미인지 내 말로 설명해요. 명확한 설명은 한 번 들어도 잘 기억해요." : "후배가 이해한 말을 확인하고, 같은 개념을 다른 표현으로 다시 설명해요."}</p>}
      </div>
    </div>
  </div>;
}

function TeachingDemo() {
  const [taught, setTaught] = useState(false);
  return <div className="ko-teaching-demo">
    <div className="ko-demo-user"><p className="editorial-label">선배의 설명 · 체험 예시</p><p>{taught ? "가격이 오르면 수요량은 줄어들어." : "아직 설명하지 않았어요."}</p><span aria-hidden="true">↙</span></div>
    <div className="ko-demo-response"><JuniorAvatar character="MALE_EASY" size={230} mood={taught ? "happy" : "think"} /><div className="ko-demo-bubble" aria-live="polite"><p className="editorial-label">후배의 답</p><p>{taught ? "아, 그렇군요. 가격이 오르면 수요량은 줄어드는군요. 알겠습니다!" : "아직 배우지 못해서 모르겠습니다."}</p></div></div>
    <div className="ko-demo-action"><Button variant="secondary" onClick={() => setTaught(!taught)}>{taught ? "설명하기 전과 비교" : "한 문장 가르쳐 보기"}</Button><p>후배의 오답에서 내가 빠뜨린 설명을 발견할 수 있어요.</p></div>
  </div>;
}

export function Orientation() {
  const user = useCurrentUser();
  const router = useRouter();
  const replay = useSearchParams().get("mode") === "replay";
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);

  async function finish(destination: "/" | "/new" | "/mypage") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!replay && !user.onboardingCompleted) await api.post("/auth/onboarding");
      router.replace(destination);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오리엔테이션 완료를 저장하지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return <main className="ko-page page-enter">
    <header className="ko-header">
      <p className="ko-brand">새내기<svg aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M16 1v30M1 16h30M5.4 5.4l21.2 21.2M5.4 26.6 26.6 5.4" stroke="currentColor" strokeWidth="4" /></svg><span>선배 오리엔테이션</span></p>
      {replay ? <Link href="/mypage" className="text-link">마이페이지로 돌아가기 →</Link> : <Chip tone="green">{user.nickname} 선배의 첫 수업</Chip>}
    </header>
    <ol className="ko-progress" aria-label="오리엔테이션 진행 단계">
      {STEPS.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={clsx(index <= step && "is-complete", step === index && "is-current")}><span>{index < step ? "✓" : `0${index + 1}`}</span><span>{label}</span></li>)}
    </ol>
    <div className="ko-body">
      <section className="ko-introduction">
        <p className="editorial-label">이용 안내 · 0{step + 1} / 04</p>
        <h1 ref={heading} tabIndex={-1} className={step === 1 || step === 2 ? "ko-title-two-lines" : undefined}>{TITLES[step]}</h1>
        <p className="ko-description">{[
          "공부한 내용을 AI 후배에게 직접 설명해요. 처음엔 아무것도 모르는 후배를 가르치며 내 이해도도 확인합니다.",
          "후배는 자료의 정답을 몰래 보지 않아요. 선배가 실제로 가르쳐 준 내용으로만 시험을 봅니다.",
          "세 후배를 눌러 비교해 보세요. 질문과 가르치는 방식부터 시험까지 서로 달라요.",
          "후배가 틀린 곳을 오답노트로 돌아보고 다시 가르쳐요. 목차를 하나씩 통과하면 함께 졸업할 수 있어요.",
        ][step]}</p>
        <span className="ko-big-number" aria-hidden="true">0{step + 1}<span>↗</span></span>
      </section>
      <div className="ko-experience" key={step}>
        {step === 0 && <div className="ko-welcome">
          <div className="ko-welcome-art">
            <span className="ko-welcome-note">가르친 만큼 배우는 AI 후배들</span>
            <JuniorTrio className="ko-welcome-characters" />
          </div>
          <div className="ko-role"><div><p className="editorial-label">오늘의 역할</p><p>설명하는 선배</p></div><span>자료를 내 말로<br />풀어 주는 사람</span><span aria-hidden="true">↗</span></div>
        </div>}
        {step === 1 && <TeachingDemo />}
        {step === 2 && <CharacterLesson />}
        {step === 3 && <ol className="ko-flow" aria-label="자료 업로드부터 후배 졸업까지의 학습 흐름">{FLOW.map((item, index) => <li key={item.label} className={clsx(index === FLOW.length - 1 && "ko-flow-finale")}><span className="ko-flow-number">0{index + 1}</span><div><p>{item.label}</p><p>{item.detail}</p></div>{index < FLOW.length - 1 ? <span className="ko-flow-direction" aria-hidden="true">↗</span> : <JuniorTrio graduation className="ko-graduation-characters" />}</li>)}</ol>}
      </div>
    </div>
    {error && <p className="mt-5 rounded-sm bg-danger-soft p-3 text-sm text-danger" role="alert">{error}</p>}
    <footer className="ko-footer">
      <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>← 이전</Button>
      <p>언제든 마이페이지에서<br />서비스 이용 방법을 다시 볼 수 있어요.</p>
      {step < 3 ? <Button onClick={() => setStep(step + 1)}>다음 →</Button> : replay ? <Button loading={busy} onClick={() => void finish("/mypage")}>마이페이지로 돌아가기</Button> : <div className="ko-finish"><Button variant="secondary" disabled={busy} onClick={() => void finish("/")}>일단 둘러보기</Button><Button loading={busy} onClick={() => void finish("/new")}>첫 자료 올리기 →</Button></div>}
    </footer>
  </main>;
}
