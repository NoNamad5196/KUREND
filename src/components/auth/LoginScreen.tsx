"use client";
/** KUREND 로그인 화면. Google OAuth 진입과 콜백 오류 안내를 제공한다. */
import { useEffect } from "react";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { Toaster, toast } from "@/components/session/ui";
import "./login.css";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 35.3 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginScreen() {
  useEffect(() => {
    // 정적 프리렌더 페이지라 useSearchParams 대신 브라우저에서 직접 읽는다 (?error= 는 Google 콜백이 붙인다)
    const code = new URLSearchParams(window.location.search).get("error");
    if (!code) return;
    const message: Record<string, string> = {
      google_unavailable: "지금은 Google 로그인에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.",
      google_denied: "Google 로그인이 취소됐어요.",
      google_state: "로그인 요청이 만료됐어요. 다시 시도해 주세요.",
      google_failed: "Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
    toast(message[code] ?? "로그인에 실패했어요.", "error");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <main className="kl-page page-enter">
      <header className="kl-header">
        <span className="kl-wordmark">KUREND<svg aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M16 1v30M1 16h30M5.4 5.4l21.2 21.2M5.4 26.6 26.6 5.4" stroke="currentColor" strokeWidth="4" /></svg></span>
        <span className="editorial-label">A CAMPUS FOR THE WAY YOU LEARN</span>
      </header>
      <div className="kl-layout">
        <section className="kl-story" aria-labelledby="login-title">
          <p className="editorial-label">LEARN BY TEACHING · KUREND</p>
          <h1 id="login-title">가르치는 순간,<br /><span>내 공부가 된다.</span></h1>
          <p className="kl-intro">내가 선배가 되는 새로운 공부.<br />후배에게 설명하며, 배운 내용을 내 지식으로 만들어요.</p>
          <div className="kl-art" aria-label="함께 공부할 남학생, 여학생, KU 후배">
            <div className="kl-art-field" aria-hidden="true"><span>YOUR<br />NEXT CHAPTER.</span></div>
            <span className="kl-art-note">이제, 선배 차례예요.</span>
            <JuniorAvatar character="MALE_EASY" size={300} className="kl-character kl-character-male" />
            <JuniorAvatar character="FEMALE_NORMAL" size={280} className="kl-character kl-character-female" />
            <JuniorAvatar character="KU_HARD" size={190} className="kl-character kl-character-ku" />
            <span className="kl-art-caption">MEET YOUR JUNIORS <span aria-hidden="true">↗</span></span>
          </div>
        </section>

        <section className="kl-access" aria-labelledby="login-access-title">
          <div className="kl-access-heading">
            <p className="editorial-label">LET’S GET STARTED</p>
            <h2 id="login-access-title">선배, 어서 오세요.</h2>
            <p>공부한 내용을 AI 후배에게 직접 설명해요.<br />후배는 내가 가르친 내용만으로 시험을 봐요.</p>
          </div>

          <a href="/api/auth/google" className="kl-google">
            <GoogleMark />
            <span className="whitespace-nowrap">Google로 계속하기</span>
            <span className="ml-auto text-muted" aria-hidden="true">→</span>
          </a>
          <p className="kl-access-footnote">Google 계정으로 로그인하면 내 자료와 학습 기록이 내 계정에 남습니다. <a href="/privacy.html" className="underline">개인정보 처리방침</a></p>
        </section>
      </div>
      <footer className="kl-footer">
        <span className="editorial-label">TEACH IT. MAKE IT YOURS.</span>
        <ol aria-label="KUREND 학습 흐름">
          {["자료 올리기", "후배 선택", "직접 설명", "후배 시험", "오답 · 다시 가르치기"].map((step, index) => <li key={step}><span className="kl-flow-index">0{index + 1}</span>{step}{index < 4 && <span className="kl-flow-arrow" aria-hidden="true">↗</span>}</li>)}
        </ol>
      </footer>
      <Toaster />
    </main>
  );
}
