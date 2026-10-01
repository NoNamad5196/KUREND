"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, routeForSession } from "@/lib/client/api";
import type { HomeDto } from "@/contracts/types";
import { Card, Chip, EmptyState } from "@/components/shell/ui";
import type { RunDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { JuniorCard } from "@/components/game/JuniorCard";
import { TodayTasks } from "@/components/home/TodayTasks";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import "@/components/game/editorial.css";

function dDayLabel(n: number | null) { if (n === null) return null; return n < 0 ? "시험 끝" : n === 0 ? "D-Day" : `D-${n}`; }
function verdictLabel(value: string | null) { return value === "STABLE" ? "안정" : value === "MOSTLY" ? "대부분 이해" : value === "NEEDS_WORK" ? "보완 필요" : "진행 중"; }

export default function HomePage() {
  const [home, setHome] = useState<HomeDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunDto | null | undefined>(undefined);
  const emptyHome = !!home && !home.courses.some((course) => course.materials.length > 0) && home.recentSessions.length === 0 && home.stats.completedSessions === 0;
  useEffect(() => { api.get<HomeDto>("/home").then(setHome).catch((e) => setError(e instanceof Error ? e.message : "홈을 불러올 수 없습니다.")); }, []);
  useEffect(() => { gameApi.getCurrentRun().then(setRun).catch(() => setRun(undefined)); }, []);
  return <div className="editorial-home page-enter">
    {error && <Card role="alert" className="mb-5 border-danger text-danger">{error} <button className="ml-2 underline" onClick={() => window.location.reload()}>다시 시도</button></Card>}
    {!home && !error && <p className="py-20 text-center text-muted" role="status">자료를 불러오는 중…</p>}
    {home && <>
      <section className="editorial-home-hero" aria-labelledby="home-heading">
        <div className="editorial-home-intro">
          <p className="editorial-label"><span className="editorial-live-dot" aria-hidden="true" /> A LITTLE TEACHING, A LOT OF LEARNING</p>
          <h1 id="home-heading">설명하다 보면,<br />어느새<br /><span>내 지식</span><span className="editorial-title-dot">.</span></h1>
          <p className="editorial-home-description">{home.userName} 선배, 오늘 배운 내용을 후배에게 들려주세요.<br />알고 있던 것도, 헷갈리던 것도<br className="sm:hidden" /> 내 말로 정리해 봐요.</p>
          <Link href="/new" className="editorial-home-cta">내 자료로 공부 시작 <span aria-hidden="true">↗</span></Link>
          <div className="editorial-home-notation"><span>LEARN IT.<br />TEACH IT. OWN IT.</span><span aria-hidden="true">↓</span><span>설명하는 순간,<br />배움이 내 것이 되는 곳.</span></div>
        </div>
        {run !== undefined && !emptyHome ? <section aria-label="현재 후배" className="editorial-home-partner"><JuniorCard run={run} meetHref={home.courses[0]?.materials[0] ? `/materials/${home.courses[0].materials[0].materialId}/junior` : "/new"} /></section> : <div className="editorial-home-welcome" aria-label="함께 공부할 후배들">
          <p className="editorial-label">MEET. TEACH. UNDERSTAND.</p>
          <span className="editorial-welcome-word" aria-hidden="true">HELLO,<br />SENIOR.</span>
          <div className="editorial-welcome-characters"><JuniorAvatar character="MALE_EASY" size={270} pose="still" /><JuniorAvatar character="FEMALE_NORMAL" size={270} pose="still" /><JuniorAvatar character="KU_HARD" size={175} pose="still" /></div>
          <p className="editorial-welcome-caption">선배의 첫 수업을 기다리고 있어요.</p>
        </div>}
      </section>
      {!emptyHome && <TodayTasks home={home} run={run} />}
      <section aria-labelledby="courses-heading" className="editorial-course-section" id="study-library">
        <div className="editorial-section-heading"><div><p className="editorial-label">01 / THE STUDY LIBRARY</p><h2 id="courses-heading">내 과목</h2></div><Link href="/new" className="text-link">새 자료 올리기 <span aria-hidden="true">↗</span></Link></div>
        {home.courses.length ? <div className="editorial-courses">{home.courses.map((course) => <div key={course.courseName} className="editorial-course">
          <div className="editorial-course-label"><h3>{course.courseName}</h3>{dDayLabel(course.dDay) && <Chip tone={course.dDay !== null && course.dDay <= 7 && course.dDay >= 0 ? "yellow" : "neutral"}>{dDayLabel(course.dDay)}</Chip>}</div>
          <div className="editorial-materials">{course.materials.map((material, index) => { const progress = material.chapterCount ? Math.min(100, Math.round(material.taughtCount / material.chapterCount * 100)) : 0; return <article key={material.materialId} className="editorial-material">
            <span className="editorial-material-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div className="editorial-material-title"><Link href={`/materials/${material.materialId}`}>{material.title}</Link><p>{material.resume ? `${material.resume.chapterTitle} · ${material.resume.stageLabel}` : "새로운 목차를 골라 보세요"}</p></div>
            <div className="editorial-material-progress"><div><span>목차 {material.chapterCount}개 중 {material.taughtCount}개 가르침</span><b>{progress}%</b></div><div className="editorial-material-track"><span style={{ width: `${progress}%` }} /></div></div>
            <Link className="editorial-material-action" href={material.resume ? routeForSession(material.resume) : `/materials/${material.materialId}`}>{material.resume ? "이어하기" : "자료 보기"}<span aria-hidden="true">↗</span></Link>
          </article>; })}</div>
        </div>)}</div> : <EmptyState title="아직 자료가 없습니다" description="공부할 자료를 올리고 후배와 함께 시작해 보세요." action={<Link href="/new" className="text-link">새 자료 올리기 →</Link>} />}
      </section>
      <div className="editorial-home-journal">
        <section aria-labelledby="recent-heading"><div className="editorial-section-heading"><div><p className="editorial-label">02 / RECENT MOMENTS</p><h2 id="recent-heading">최근 세션</h2></div></div>
          <div className="editorial-recent-list">{home.recentSessions.length ? home.recentSessions.slice(0, 5).map((session, index) => <Link key={session.sessionId} href={routeForSession(session)} className="editorial-recent"><span aria-hidden="true" className="editorial-recent-index">{String(index + 1).padStart(2, "0")}</span><div><p>{session.chapterTitle}</p><span>{session.materialTitle}</span></div><Chip tone={session.finalVerdict === "STABLE" ? "green" : session.finalVerdict ? "yellow" : "neutral"}>{verdictLabel(session.finalVerdict)}{session.score !== null ? ` · ${session.score}점` : ""}</Chip><span className="editorial-recent-arrow" aria-hidden="true">↗</span></Link>) : <p className="py-8 text-sm text-muted">아직 진행한 세션이 없습니다.</p>}</div>
        </section>
        <section aria-labelledby="stats-heading" className="editorial-statistics"><p className="editorial-label">03 / SMALL STEPS, BIG CHANGE</p><h2 id="stats-heading">쌓여가는<br />선배의 기록.</h2><dl><div><dt>완료한 세션</dt><dd>{home.stats.completedSessions}<span>회</span></dd></div><div><dt>평균 점수</dt><dd>{home.stats.averageScore ?? "–"}<span>점</span></dd></div><div><dt>연속 학습</dt><dd>{home.stats.streakDays}<span>일</span></dd></div></dl></section>
      </div>
    </>}
  </div>;
}
