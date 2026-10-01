"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HomeDto } from "@/contracts/types";
import { api } from "@/lib/client/api";
import { useCurrentUser } from "@/components/shell/AppShell";
import { Button, Card, PageHeader } from "@/components/shell/ui";
import { WrongNotesHub } from "./WrongNotesHub";
import { TeacherNoteCollection } from "./TeacherNoteCollection";
import "./archive.css";

export function MyPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [home, setHome] = useState<HomeDto | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

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
    <PageHeader eyebrow="MY COLLECTION / PERSONAL ARCHIVE" title="마이페이지" description="지금까지의 공부를 돌아보고, 필요한 곳부터 다시 가르쳐 보세요." />

    <section className="archive-profile" aria-labelledby="archive-profile-heading">
      <div className="min-w-0">
        <p className="editorial-label mb-3">A RECORD OF OUR DAYS</p>
        <h2 id="archive-profile-heading" className="archive-profile-name">{user?.nickname ?? home?.userName ?? "나의"}<br /><span>선배의 학습 기록</span></h2>
        <p className="mt-4 max-w-sm text-sm leading-7 text-muted">설명하고, 되짚고, 후배와 함께 성장해요.<br />그동안 쌓아온 배움이 이곳에 남아 있어요.</p>
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
            <p className="editorial-label mb-3">TEACHING NOTES</p>
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

      <section className="archive-section archive-account" aria-labelledby="account-heading">
        <header className="archive-section-heading">
          <span className="archive-index" aria-hidden="true">03</span>
          <div><p className="editorial-label mb-3">INFORMATION</p><h2 id="account-heading">이용 안내 · 계정</h2></div>
        </header>
        <div className="archive-section-body">
          <Link href="/onboarding?mode=replay" className="archive-account-link">
            <span>서비스 이용 방법 다시 보기</span><span aria-hidden="true">↗</span>
          </Link>
          <div className="mt-6">
            {logoutError && <p role="alert" className="mb-3 text-sm text-danger">{logoutError}</p>}
            <Button type="button" variant="secondary" loading={loggingOut} onClick={() => void logout()}>로그아웃</Button>
          </div>
        </div>
      </section>
    </div>
  </div>;
}
