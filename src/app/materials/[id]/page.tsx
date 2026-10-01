"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, routeForSession, sse } from "@/lib/client/api";
import type { ChapterDto, CreateSessionResponse, MaterialDto } from "@/contracts/types";
import { Button, Card, Chip, ConfirmDialog, PageHeader } from "@/components/shell/ui";
import type { RunChapterProgressDto, RunDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { CharacterBadge } from "@/components/game/CharacterBadge";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { LifeHearts } from "@/components/game/LifeHearts";
import { TeacherNoteSection } from "@/components/game/TeacherNoteSection";

function ChapterRow({ chapter, onStart, busy, progress }: { chapter: ChapterDto; onStart: (chapterId: string) => void; busy: boolean; progress?: RunChapterProgressDto }) {
  const action = chapter.action;
  const symbol = progress ? (progress.cleared ? "✓" : progress.attempts > 0 ? "…" : "○") : chapter.stableAt ? "★" : chapter.taughtAt ? "●" : "○";
  return <li className="flex flex-col gap-4 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-bold text-primary">{chapter.order}</span><div><h3 className="font-bold">{chapter.title} <span className={progress?.cleared ? "ml-1 text-ok" : "ml-1 text-primary"} aria-label={progress ? (progress.cleared ? "통과" : progress.attempts > 0 ? "도전 중" : "미도전") : chapter.stableAt ? "안정" : chapter.taughtAt ? "가르침" : "미가르침"}>{symbol}</span></h3><div className="mt-2 flex flex-wrap gap-1.5">{chapter.points.map((point) => <Chip key={point}>{point}</Chip>)}</div>{progress && progress.attempts > 0 && <p className="mt-2 text-xs text-muted">{progress.cleared ? <span className="font-semibold text-ok">통과</span> : <span className="font-semibold text-warn">아직 미통과</span>} · 시도 {progress.attempts}회{progress.bestScore !== null && ` · 최고 ${progress.bestScore}점`}</p>}{!progress && (chapter.bestScore !== null || chapter.openGapCount > 0) && <p className="mt-2 text-xs text-muted">{chapter.bestScore !== null && `최고 ${chapter.bestScore}점`}{chapter.bestScore !== null && chapter.openGapCount > 0 && " · "}{chapter.openGapCount > 0 && `놓친 곳 ${chapter.openGapCount}개`}</p>}</div></div>{action.kind === "CONTINUE" ? <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold hover:bg-bg" href={routeForSession({ sessionId: action.sessionId, status: action.status })}>이어하기 →</Link> : <Button variant={action.kind === "RETRY" ? "secondary" : "primary"} loading={busy} className="shrink-0" onClick={() => onStart(chapter.chapterId)}>{action.kind === "RETRY" ? "다시 가르치기" : "가르치기"} →</Button>}</li>;
}

export default function MaterialPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [material, setMaterial] = useState<MaterialDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("자료를 준비하고 있습니다.");
  const [elapsed, setElapsed] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [busyChapter, setBusyChapter] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const generationStarted = useRef(false);
  // 게임 Run: undefined = 아직 모름/API 없음(연습 모드 유지), null = API 는 있는데 Run 없음(후배 선택으로), RunDto = 진행 중
  const [run, setRun] = useState<RunDto | null | undefined>(undefined);
  const load = useCallback(async () => {
    const result = await api.get<MaterialDto>(`/materials/${id}`); setMaterial(result);
    gameApi.getCurrentRun(id).then(setRun).catch(() => setRun(undefined));
    return result;
  }, [id]);

  const generate = useCallback(async () => {
    if (generationStarted.current) return;
    generationStarted.current = true; setGenerating(true); setError(null); setElapsed(0);
    try {
      await sse(`/materials/${id}/generate`, { method: "POST" }, (name, data) => {
        if (name === "progress") setProgress(data.message);
        if (name === "chapters") setProgress(`${data.chapters.length}개의 목차를 만들었습니다.`);
      });
      const ready = await load();
      // 목차가 생기면 가르치기 전에 후배(=난이도)를 고른다. Run 이 이미 있으면 그대로 자료 페이지.
      if (ready.status === "READY") { const current = await gameApi.getCurrentRun(id).catch(() => undefined); if (current === null) router.push(`/materials/${id}/junior`); }
    } catch (e) { setError(e instanceof Error ? e.message : "목차를 만들지 못했습니다."); }
    finally { setGenerating(false); generationStarted.current = false; }
  }, [id, load, router]);

  useEffect(() => { let active = true; load().then((result) => { if (active && result.status === "PENDING") void generate(); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "자료를 불러오지 못했습니다."); }); return () => { active = false; }; }, [load, generate]);
  useEffect(() => { if (!generating) return; const timer = setInterval(() => setElapsed((n) => n + 1), 1000); return () => clearInterval(timer); }, [generating]);

  async function start(chapterId: string) {
    if (run === null) { router.push(`/materials/${id}/junior`); return; }
    setBusyChapter(chapterId); setError(null); try { const result = await api.post<CreateSessionResponse>("/sessions", { chapterId }); router.push(`/session/${result.sessionId}/prepare`); } catch (e) { setError(e instanceof Error ? e.message : "세션을 시작하지 못했습니다."); setBusyChapter(null); } }
  async function remove() { setDeleting(true); try { await api.del(`/materials/${id}`); router.push("/"); } catch (e) { setError(e instanceof Error ? e.message : "자료를 삭제하지 못했습니다."); setDeleting(false); setDeleteOpen(false); } }
  return <>
    <Link href="/" className="mb-5 inline-block text-sm font-semibold text-muted hover:text-primary">← 홈</Link>
    <PageHeader title={material?.title || "자료"} description={material ? `${material.courseName}${material.examDate ? ` · 시험일 ${material.examDate}` : ""}` : "자료를 불러오는 중…"} />
    {error && <Card role="alert" className="mb-5 border-danger text-danger">{error}</Card>}
    {!material && !error && <p className="py-20 text-center text-muted" role="status">자료를 불러오는 중…</p>}
    {material && <>
      <div className="mb-5 flex flex-wrap gap-2">{material.sources.map((source) => <Chip key={source.sourceId} tone="green">{source.kind} · {source.fileName}</Chip>)}</div>
      {material.status !== "READY" ? <Card className="max-w-2xl py-10 text-center"><div aria-hidden="true" className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-3xl">✦</div><h2 className="mt-5 text-xl font-bold">{material.status === "FAILED" ? "목차를 만들지 못했어요" : "새내기가 자료를 읽는 중"}</h2><p className="mt-2 text-muted" role="status">{generating ? progress : material.error || "목차를 만드는 중입니다."}</p>{generating && <p className="mt-2 text-xs text-muted">{elapsed}초 경과</p>}{!generating && <Button className="mt-6" onClick={generate}>다시 시도</Button>}</Card> : <>
        {run && <Card className="mb-5 grid gap-4 sm:grid-cols-[96px_1fr_auto] sm:items-center"><div className="mx-auto h-24"><JuniorAvatar character={run.character} size={96} mood={run.lives === 1 ? "confused" : "idle"} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CharacterBadge character={run.character} avatar={false} /><LifeHearts lives={run.lives} maxLives={run.maxLives} size={20} /></div><p className="mt-2 text-sm text-muted">졸업까지 <span className="font-bold text-ink tabular-nums">{run.progress.cleared} / {run.progress.total}</span> 챕터 · 합격 {run.passScore}점 · {run.examFormat === "OBJECTIVE" ? "객관식" : "서술형"}</p>{run.status !== "ACTIVE" && <p className="mt-1 text-xs text-danger">이 후배는 {run.status === "GRADUATED" ? "졸업했어요" : "떠났어요"}. 새 후배를 만나세요.</p>}</div>{run.canGraduate && run.status === "ACTIVE" ? <Link href={`/runs/${run.runId}/graduation`}><Button>졸업하기 🎓</Button></Link> : run.status !== "ACTIVE" ? <Link href={`/materials/${id}/junior`}><Button>새 후배 만나기</Button></Link> : null}</Card>}
        {run === null && <Card className="mb-5 flex flex-col items-center gap-3 border-primary bg-primary-soft p-5 text-center sm:flex-row sm:text-left"><JuniorAvatar character="KU_HARD" size={88} mood="talk" /><div className="min-w-0 flex-1"><p className="text-lg font-black">먼저 가르칠 후배를 골라 주세요</p><p className="mt-1 text-sm text-muted">후배마다 이해 방식·시험 형식·합격선이 다릅니다. 졸업시키면 다음 후배를 만날 수 있어요.</p></div><Link href={`/materials/${id}/junior`}><Button>후배 선택 →</Button></Link></Card>}
        <p className="mb-4 text-sm text-muted">한 번에 목차 하나를 가르칩니다. 순서는 자유입니다.</p><Card><h2 className="text-lg font-bold">목차 <span className="text-primary">{material.chapters.length}</span></h2>{material.chapters.length ? <ol className="mt-2">{material.chapters.map((chapter) => <ChapterRow key={chapter.chapterId} chapter={chapter} onStart={start} busy={busyChapter === chapter.chapterId} progress={run?.progress.chapters.find((p) => p.chapterId === chapter.chapterId)} />)}</ol> : <p className="mt-5 text-sm text-muted">목차가 비어 있습니다. 다시 생성해 주세요.</p>}</Card>{material.chapters.length > 0 && <TeacherNoteSection materialId={material.materialId} chapters={material.chapters} />}</>}
      <div className="mt-8 border-t border-line pt-5"><button className="text-sm font-semibold text-danger underline" onClick={() => setDeleteOpen(true)}>자료 삭제</button></div>
    </>}
    <ConfirmDialog open={deleteOpen} title="자료를 삭제할까요?" description="자료와 연결된 목차가 삭제됩니다. 이 작업은 되돌릴 수 없습니다." busy={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={remove} />
  </>;
}
