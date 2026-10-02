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
import { JuniorTrio } from "@/components/game/JuniorTrio";
import { StaticBackdrop } from "@/components/game/StaticBackdrop";
import { juniorLabel, withJosa } from "@/components/game/JuniorOrMascot";
import { homeStudyState } from "@/lib/client/home-study-state";
import "@/components/game/editorial.css";

function dDayLabel(n: number | null) { if (n === null) return null; return n < 0 ? "시험 끝" : n === 0 ? "D-Day" : `D-${n}`; }
function verdictLabel(value: string | null) { return value === "STABLE" ? "안정" : value === "MOSTLY" ? "대부분 이해" : value === "NEEDS_WORK" ? "보완 필요" : "진행 중"; }

export default function HomePage() {
  const [home, setHome] = useState<HomeDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunDto | null | undefined>(undefined);
  const [runError, setRunError] = useState<string | null>(null);
  const emptyHome = !!home && !home.courses.some((course) => course.materials.length > 0) && home.recentSessions.length === 0 && home.stats.completedSessions === 0;
  const study = home ? homeStudyState(home, run) : null;
  const introduction = home && study && <div className="editorial-home-intro">
    <p className="editorial-home-greeting">{home.userName} 선배</p>
    <h1 id="home-heading" className={!run ? "editorial-home-question" : undefined}>{run ? study.kind === "next" || (study.kind === "resume" && study.resume.status === "EXPLAINING") ? `${withJosa(juniorLabel(run.character), "이/가")} 기다리고 있어요.` : `${withJosa(juniorLabel(run.character), "과/와")} ${study.kind === "resume" ? "수업을 이어가요." : "학습을 돌아봐요."}` : <>선배,<br /><span>오늘은 뭐 가르쳐 줄 거에요?</span></>}</h1>
    <p className="editorial-home-description">{study.kind === "resume" ? "저장한 수업을 멈췄던 단계부터 이어갈 수 있어요." : study.kind === "next" ? "자료를 살펴본 뒤, 후배에게 내 말로 설명해 주세요." : study.kind === "final" ? "목차별 학습을 마쳤어요. 후배의 시험과 학습 기록을 확인해 보세요." : run ? "자료에서 다음에 공부할 목차를 확인해 주세요." : "공부한 내용을 AI 후배에게 설명해 주세요. 후배는 선배가 가르친 내용만으로 시험을 봐요."}</p>
    {study.kind === "new" && <Link href={study.href} className="editorial-home-cta">후배 만나기 <span aria-hidden="true">→</span></Link>}
  </div>;
  useEffect(() => { api.get<HomeDto>("/home").then(setHome).catch((e) => setError(e instanceof Error ? e.message : "홈을 불러올 수 없습니다.")); }, []);
  useEffect(() => { gameApi.getCurrentRun().then(setRun).catch(() => setRunError("후배 정보를 불러오지 못했어요.")); }, []);
  return <div className="editorial-home page-enter">
    {error && <Card role="alert" className="mb-5 border-danger text-danger">{error} <button className="ml-2 underline" onClick={() => window.location.reload()}>다시 시도</button></Card>}
    {!home && !error && <p className="py-20 text-center text-muted" role="status">자료를 불러오는 중…</p>}
    {home && <>
      {study?.kind === "loading" ? <section className="editorial-home-loading" aria-label="현재 학습">
        {runError ? <p role="alert">{runError} <button className="ml-2 underline" onClick={() => window.location.reload()}>다시 시도</button></p> : <p role="status">현재 학습을 확인하고 있어요…</p>}
      </section> : study && <section className={run && study.kind !== "new" ? "editorial-home-hero editorial-home-hero-active" : "editorial-home-hero"} aria-labelledby="home-heading">
        {run && study.kind !== "new" ? <JuniorCard run={run} study={study} intro={introduction} /> : <>{introduction}<div className="editorial-home-welcome" aria-label="함께 공부할 후배들">
          <StaticBackdrop />
          <JuniorTrio className="editorial-welcome-characters" />
          <p className="editorial-welcome-caption">컴돌이 · KU · 컴순이</p>
        </div></>}
      </section>}
      {!emptyHome && <TodayTasks home={home} run={run} />}
      <section aria-labelledby="courses-heading" className="editorial-course-section" id="study-library">
        <div className="editorial-section-heading"><h2 id="courses-heading">내 과목</h2><Link href="/new" className="text-link">새 자료 올리기 <span aria-hidden="true">↗</span></Link></div>
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
        <section aria-labelledby="recent-heading"><div className="editorial-section-heading"><h2 id="recent-heading">최근 세션</h2></div>
          <div className="editorial-recent-list">{home.recentSessions.length ? home.recentSessions.slice(0, 5).map((session, index) => <Link key={session.sessionId} href={routeForSession(session)} className="editorial-recent"><span aria-hidden="true" className="editorial-recent-index">{String(index + 1).padStart(2, "0")}</span><div><p>{session.chapterTitle}</p><span>{session.materialTitle}</span></div><Chip tone={session.finalVerdict === "STABLE" ? "green" : session.finalVerdict ? "yellow" : "neutral"}>{verdictLabel(session.finalVerdict)}{session.score !== null ? ` · ${session.score}점` : ""}</Chip><span className="editorial-recent-arrow" aria-hidden="true">↗</span></Link>) : <p className="py-8 text-sm text-muted">아직 진행한 세션이 없습니다.</p>}</div>
        </section>
        <section aria-labelledby="stats-heading" className="editorial-statistics"><h2 id="stats-heading">학습 기록</h2><dl><div><dt>완료한 세션</dt><dd>{home.stats.completedSessions}<span>회</span></dd></div><div><dt>평균 점수</dt><dd>{home.stats.averageScore ?? "–"}<span>점</span></dd></div><div><dt>연속 학습</dt><dd>{home.stats.streakDays}<span>일</span></dd></div></dl></section>
      </div>
    </>}
  </div>;
}
