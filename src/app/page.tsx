"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, routeForSession } from "@/lib/client/api";
import type { HomeDto } from "@/contracts/types";
import { Button, Card, Chip, EmptyState, PageHeader } from "@/components/shell/ui";
import type { RunDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { JuniorCard } from "@/components/game/JuniorCard";
import { TodayTasks } from "@/components/home/TodayTasks";

function dDayLabel(n: number | null) { if (n === null) return null; return n < 0 ? "시험 끝" : n === 0 ? "D-Day" : `D-${n}`; }
function verdictLabel(value: string | null) { return value === "STABLE" ? "안정" : value === "MOSTLY" ? "대부분 이해" : value === "NEEDS_WORK" ? "보완 필요" : "진행 중"; }

export default function HomePage() {
  const [home, setHome] = useState<HomeDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunDto | null | undefined>(undefined);
  useEffect(() => { api.get<HomeDto>("/home").then(setHome).catch((e) => setError(e instanceof Error ? e.message : "홈을 불러올 수 없습니다.")); }, []);
  useEffect(() => { gameApi.getCurrentRun().then(setRun).catch(() => setRun(undefined)); }, []);
  return <>
    <PageHeader title="홈" description={home ? `${home.userName} 선배, 오늘은 무엇을 가르쳐 볼까요?` : "새내기와 함께 배운 내용을 확인해 보세요."} actions={<Link href="/new"><Button>＋ 새 자료</Button></Link>} />
    {error && <Card role="alert" className="mb-5 border-danger text-danger">{error} <button className="ml-2 underline" onClick={() => window.location.reload()}>다시 시도</button></Card>}
    {!home && !error && <p className="py-20 text-center text-muted" role="status">자료를 불러오는 중…</p>}
    {home && <>
      {run !== undefined && <section aria-label="현재 후배" className="mb-8"><JuniorCard run={run} meetHref={home.courses[0]?.materials[0] ? `/materials/${home.courses[0].materials[0].materialId}/junior` : "/new"} /></section>}
      <TodayTasks home={home} run={run} />
      <section aria-labelledby="courses-heading"><h2 id="courses-heading" className="mb-4 text-lg font-bold">내 과목</h2>{home.courses.length ? <div className={home.courses.length > 1 ? "grid gap-7 xl:grid-cols-2" : "space-y-7"}>{home.courses.map((course) => <div key={course.courseName}><div className="mb-3 flex items-center gap-2"><h3 className="text-base font-bold">{course.courseName}</h3>{dDayLabel(course.dDay) && <Chip tone={course.dDay !== null && course.dDay <= 7 && course.dDay >= 0 ? "yellow" : "neutral"}>{dDayLabel(course.dDay)}</Chip>}</div><div className={home.courses.length > 1 ? "grid gap-3 md:grid-cols-2 xl:grid-cols-1" : "grid gap-3 md:grid-cols-2"}>{course.materials.map((material) => { const progress = material.chapterCount ? Math.min(100, Math.round(material.taughtCount / material.chapterCount * 100)) : 0; return <Card key={material.materialId} className="flex flex-col"><Link className="text-lg font-bold hover:text-primary" href={`/materials/${material.materialId}`}>{material.title}</Link><p className="mt-1 text-sm text-muted">목차 {material.chapterCount}개 중 {material.taughtCount}개 가르침</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><div className="mt-5 flex items-end justify-between gap-3"><span className="text-xs text-muted">{material.resume ? `${material.resume.chapterTitle} · ${material.resume.stageLabel}` : "새로운 목차를 골라 보세요"}</span><Link className="shrink-0 text-sm font-bold text-primary hover:underline" href={material.resume ? routeForSession(material.resume) : `/materials/${material.materialId}`}>{material.resume ? "이어하기 →" : "자료 보기 →"}</Link></div></Card>; })}</div></div>)}</div> : <EmptyState title="아직 자료가 없습니다" description="강의 자료를 올리고 새내기에게 첫 목차를 가르쳐 보세요." action={<Link href="/new"><Button>새 자료 올리기</Button></Link>} />}</section>
      <div className="mt-10 grid gap-5 lg:grid-cols-[2fr_1fr]"><section aria-labelledby="recent-heading"><h2 id="recent-heading" className="mb-4 text-lg font-bold">최근 세션</h2><Card className="divide-y divide-line p-0">{home.recentSessions.length ? home.recentSessions.slice(0, 5).map((session) => <Link key={session.sessionId} href={routeForSession(session)} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-bg"><div><p className="font-semibold">{session.chapterTitle}</p><p className="mt-1 text-xs text-muted">{session.materialTitle}</p></div><Chip tone={session.finalVerdict === "STABLE" ? "green" : session.finalVerdict ? "yellow" : "neutral"}>{verdictLabel(session.finalVerdict)}{session.score !== null ? ` · ${session.score}점` : ""}</Chip></Link>) : <p className="p-5 text-sm text-muted">아직 진행한 세션이 없습니다.</p>}</Card></section><section aria-labelledby="stats-heading"><h2 id="stats-heading" className="mb-4 text-lg font-bold">학습 기록</h2><Card className="grid grid-cols-3 gap-2 text-center lg:grid-cols-1 lg:text-left"><div><p className="text-xs text-muted">완료한 세션</p><p className="mt-1 text-2xl font-bold text-primary">{home.stats.completedSessions}<span className="ml-1 text-sm">회</span></p></div><div><p className="text-xs text-muted">평균 점수</p><p className="mt-1 text-2xl font-bold text-primary">{home.stats.averageScore ?? "–"}<span className="ml-1 text-sm">점</span></p></div><div><p className="text-xs text-muted">연속 학습</p><p className="mt-1 text-2xl font-bold text-primary">{home.stats.streakDays}<span className="ml-1 text-sm">일</span></p></div></Card></section></div>
    </>}
  </>;
}
