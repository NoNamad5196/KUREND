"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HomeDto } from "@/contracts/types";
import { api } from "@/lib/client/api";
import { useCurrentUser } from "@/components/shell/AppShell";
import { Button, Card, PageHeader } from "@/components/shell/ui";
import { WrongNotesHub } from "./WrongNotesHub";
import { TeacherNoteCollection } from "./TeacherNoteCollection";
import { computeAchievements } from "@/lib/client/achievements";
import { useAchievementInputs } from "@/components/achievements/useAchievementInputs";
import { AchievementsSummary } from "@/components/profile/AchievementsSummary";
import { SettingsPanel } from "@/components/profile/SettingsPanel";
import "./archive.css";

export function MyPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [home, setHome] = useState<HomeDto | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const achievementInputs = useAchievementInputs("업적을 불러오지 못했어요.");
  const achievements = useMemo(() => (achievementInputs.data ? computeAchievements(achievementInputs.data) : null), [achievementInputs.data]);

  useEffect(() => {
    let active = true;
    setHomeError(null);
    api.get<HomeDto>("/home").then((result) => {
      if (active) setHome(result);
    }).catch((error: unknown) => {
      if (active) setHomeError(error instanceof Error ? error.message : "학습 기록을 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, [attempt]);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await api.post("/auth/logout");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "로그아웃하지 못했습니다. 다시 시도해 주세요.");
      setLoggingOut(false);
    }
  }

  return <div className="archive-page page-enter">
    <PageHeader title="마이페이지" description="지금까지의 공부를 돌아보고, 필요한 곳부터 다시 가르쳐 보세요." />

    <section className="archive-profile" aria-labelledby="archive-profile-heading">
      <div className="min-w-0">
        <h2 id="archive-profile-heading" className="archive-profile-name">{user?.nickname ?? home?.userName ?? "나의"}<br /><span>선배의 학습 기록</span></h2>
        <p className="mt-4 max-w-sm text-sm leading-7 text-muted">학습 기록과 오답노트를 한곳에서 확인해요.</p>
      </div>
      {home ? <dl className="archive-stats">
        <div><dt>완료한 세션</dt><dd>{home.stats.completedSessions}<span>회</span></dd></div>
        <div><dt>평균 점수</dt><dd>{home.stats.averageScore ?? "–"}<span>점</span></dd></div>
        <div><dt>연속 학습</dt><dd>{home.stats.streakDays}<span>일</span></dd></div>
      </dl> : !homeError && <p role="status" className="text-sm text-muted">학습 기록을 불러오는 중…</p>}
    </section>

    <div className="archive-sections">
      <WrongNotesHub />

      <section className="archive-section" aria-labelledby="teacher-notes-heading">
        <header className="archive-section-heading">
          <span className="archive-index" aria-hidden="true">02</span>
          <div>
            <h2 id="teacher-notes-heading">선배의 학습노트</h2>
            <p>자료와 목차별로 모인 강의노트에서 다시 설명할 내용을 찾아보세요.</p>
          </div>
        </header>
        <div className="archive-section-body">
          {homeError && <Card role="alert" className="border-danger">
            <p className="text-sm text-danger">{homeError}</p>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>학습 기록 다시 불러오기</Button>
          </Card>}
          {home ? <TeacherNoteCollection courses={home.courses} /> : !homeError && <p role="status" className="py-8 text-sm text-muted">자료 목록을 불러오는 중…</p>}
        </div>
      </section>

      <section className="archive-section" aria-labelledby="achievements-heading">
        <header className="archive-section-heading">
          <span className="archive-index" aria-hidden="true">03</span>
          <div>
            <h2 id="achievements-heading">업적</h2>
            <p>수업을 마치고, 합격하고, 꾸준히 가르칠수록 배지가 하나씩 열려요.</p>
          </div>
        </header>
        <div className="archive-section-body">
          {achievements ? <AchievementsSummary list={achievements} /> : achievementInputs.error ? <div role="alert"><p className="text-sm text-danger">{achievementInputs.error}</p><Button type="button" variant="secondary" className="mt-3" onClick={achievementInputs.reload}>다시 불러오기</Button></div> : <p role="status" className="py-8 text-sm text-muted">업적을 불러오는 중…</p>}
        </div>
      </section>

      <section className="archive-section" aria-labelledby="settings-heading">
        <header className="archive-section-heading">
          <span className="archive-index" aria-hidden="true">04</span>
          <div>
            <h2 id="settings-heading">설정</h2>
            <p>애니메이션·타이핑 연출·시험 진행 방식을 내게 맞게 바꿔요.</p>
          </div>
        </header>
        <div className="archive-section-body"><SettingsPanel /></div>
      </section>

      <section className="archive-section archive-account" aria-labelledby="account-heading">
        <header className="archive-section-heading">
          <span className="archive-index" aria-hidden="true">05</span>
          <div><h2 id="account-heading">이용 안내 · 계정</h2></div>
        </header>
        <div className="archive-section-body">
          <Link href="/onboarding?mode=replay" className="archive-account-link">
            <span>서비스 이용 방법 다시 보기</span><span aria-hidden="true">↗</span>
          </Link>
          <a href="/privacy.html" className="archive-account-link mt-4">
            <span>개인정보처리방침</span><span aria-hidden="true">↗</span>
          </a>
          <p className="mt-4 text-xs leading-6 text-muted">올린 자료와 학습 기록은 내 계정에만 저장돼요. 후배의 대화와 채점을 위해 자료 일부가 AI 서비스로 전송될 수 있어요.</p>
          <div className="mt-6">
            {logoutError && <p role="alert" className="mb-3 text-sm text-danger">{logoutError}</p>}
            <Button type="button" variant="secondary" loading={loggingOut} onClick={() => void logout()}>로그아웃</Button>
          </div>
        </div>
      </section>
    </div>
  </div>;
}
