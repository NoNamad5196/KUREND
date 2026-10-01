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
import { MaterialPreparation, type MaterialStep } from "@/components/material/MaterialPreparation";
import { FinalExamAction, finalStageText, inFinalStage } from "@/components/game/FinalExamAction";
import { CHARACTERS } from "@/contracts/game";

function ChapterRow({ chapter, onStart, busy, progress, disabled }: { chapter: ChapterDto; onStart: (chapterId: string) => void; busy: boolean; progress?: RunChapterProgressDto; disabled?: boolean }) {
  const action = chapter.action;
  const symbol = progress ? (progress.cleared ? "✓" : progress.attempts > 0 ? "…" : "○") : chapter.stableAt ? "★" : chapter.taughtAt ? "●" : "○";
  return <li className="flex flex-col gap-4 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-bold text-primary">{chapter.order}</span><div><h3 className="font-bold">{chapter.title} <span className={progress?.cleared ? "ml-1 text-ok" : "ml-1 text-primary"} aria-label={progress ? (progress.cleared ? "통과" : progress.attempts > 0 ? "도전 중" : "미도전") : chapter.stableAt ? "안정" : chapter.taughtAt ? "가르침" : "미가르침"}>{symbol}</span></h3><div className="mt-2 flex flex-wrap gap-1.5">{chapter.points.map((point) => <Chip key={point}>{point}</Chip>)}</div>{progress && progress.attempts > 0 && <p className="mt-2 text-xs text-muted">{progress.cleared ? <span className="font-semibold text-ok">통과</span> : <span className="font-semibold text-warn">아직 미통과</span>} · 시도 {progress.attempts}회{progress.bestScore !== null && ` · 최고 ${progress.bestScore}점`}</p>}{!progress && (chapter.bestScore !== null || chapter.openGapCount > 0) && <p className="mt-2 text-xs text-muted">{chapter.bestScore !== null && `최고 ${chapter.bestScore}점`}{chapter.bestScore !== null && chapter.openGapCount > 0 && " · "}{chapter.openGapCount > 0 && `놓친 곳 ${chapter.openGapCount}개`}</p>}</div></div>{action.kind === "CONTINUE" ? <Link aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} onClick={(event) => { if (disabled) event.preventDefault(); }} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold hover:bg-bg" href={routeForSession({ sessionId: action.sessionId, status: action.status })}>이어하기 →</Link> : <Button variant={action.kind === "RETRY" ? "secondary" : "primary"} loading={busy} disabled={disabled} className="shrink-0" onClick={() => onStart(chapter.chapterId)}>{action.kind === "RETRY" ? "다시 가르치기" : "가르치기"} →</Button>}</li>;
}

export default function MaterialPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [material, setMaterial] = useState<MaterialDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<MaterialStep>("READING");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [busyChapter, setBusyChapter] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const generation = useRef<AbortController | null>(null);
  const starting = useRef(false);
  const loadVersion = useRef(0);
  const currentId = useRef(id);
  currentId.current = id;
  const [run, setRun] = useState<RunDto | null | undefined>(undefined);
  const [runError, setRunError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const request = ++loadVersion.current;
    const [loaded, current] = await Promise.allSettled([
      api.get<MaterialDto>(`/materials/${encodeURIComponent(id)}`), gameApi.getCurrentRun(id),
    ]);
    if (loaded.status === "rejected") throw loaded.reason;
    if (request === loadVersion.current && currentId.current === id) {
      setMaterial(loaded.value);
      if (current.status === "fulfilled") { setRun(current.value); setRunError(null); }
      else { setRun(undefined); setRunError("후배 정보를 불러오지 못했습니다. 다시 불러와 주세요."); }
    }
    return loaded.value;
  }, [id]);

  const generate = useCallback(async () => {
    if (generation.current) return;
    const ac = new AbortController();
    generation.current = ac;
    setGenerating(true); setGenerationError(null); setStep("READING");
    try {
      await sse(`/materials/${encodeURIComponent(id)}/generate`, { method: "POST" }, (name, data) => {
        if (!ac.signal.aborted && name === "progress" && ["READING", "SPLITTING", "TITLING"].includes(data.step)) setStep(data.step);
      }, ac.signal);
      if (ac.signal.aborted || currentId.current !== id) return;
      const ready = await load();
      if (ready.status !== "READY") throw new Error("목차 준비를 완료하지 못했습니다. 다시 시도해 주세요.");
      if (!ac.signal.aborted && currentId.current === id) {
        const current = await gameApi.getCurrentRun(id);
        if (current === null && !ac.signal.aborted) router.replace(`/materials/${id}/junior`);
      }
    } catch (failure) {
      if (ac.signal.aborted || currentId.current !== id) return;
      setGenerationError(failure instanceof Error ? failure.message : "목차를 만들지 못했습니다. 다시 시도해 주세요.");
      await load().catch(() => undefined);
    } finally {
      if (generation.current === ac) { generation.current = null; setGenerating(false); }
    }
  }, [id, load, router]);

  useEffect(() => {
    let active = true;
    setMaterial(null); setRun(undefined); setRunError(null); setError(null); setGenerationError(null); setBusyChapter(null);
    setGenerating(false);
    starting.current = false;
    void load().then((result) => { if (active && result.status === "PENDING") void generate(); })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "학습 자료를 불러오지 못했습니다."); });
    return () => { active = false; loadVersion.current += 1; generation.current?.abort(); generation.current = null; };
  }, [load, generate]);

  async function start(chapterId: string) {
    if (starting.current || generating || run === undefined || runError) return;
    if (run === null) { router.push(`/materials/${id}/junior`); return; }
    starting.current = true; setBusyChapter(chapterId); setError(null);
    try {
      const result = await api.post<CreateSessionResponse>("/sessions", { chapterId, runId: run.runId });
      if (currentId.current !== id) return;
      router.push(`/session/${result.sessionId}/prepare`);
    } catch (failure) {
      if (currentId.current !== id) return;
      setError(failure instanceof Error ? failure.message : "세션을 시작하지 못했습니다.");
      setBusyChapter(null); starting.current = false;
      await load().catch(() => undefined);
    }
  }
  async function remove() { setDeleting(true); try { await api.del(`/materials/${id}`); router.push("/"); } catch (e) { setError(e instanceof Error ? e.message : "자료를 삭제하지 못했습니다."); setDeleting(false); setDeleteOpen(false); } }
  return <>
    <Link href="/" className="mb-5 inline-block text-sm font-semibold text-muted hover:text-primary">← 홈</Link>
    <PageHeader title={material?.title || "자료"} description={material ? `${material.courseName}${material.examDate ? ` · 시험일 ${material.examDate}` : ""}` : "자료를 불러오는 중…"} />
    {error && <Card role="alert" className="mb-5 border-danger text-danger">{error}</Card>}
    {!material && !error && <p className="py-20 text-center text-muted" role="status">자료를 불러오는 중…</p>}
    {material && <>
      <div className="mb-5 flex flex-wrap gap-2">{material.sources.map((source) => <Chip key={source.sourceId} tone="green">{source.kind} · {source.fileName}</Chip>)}</div>
      {material.status !== "READY" ? <MaterialPreparation step={step} busy={generating} error={generating ? null : generationError || material.error || (material.status === "FAILED" ? "목차를 만들지 못했습니다. 다시 시도해 주세요." : null)} onRetry={() => void generate()} /> : <>
        {runError && <Card role="alert" className="mb-5 border-danger text-danger">{runError} <Button variant="secondary" onClick={() => void load().catch(() => undefined)}>다시 불러오기</Button></Card>}
        {run === undefined && !runError && <p role="status" className="mb-4 text-sm text-muted">후배 정보를 불러오는 중…</p>}
        {run && <Card className="mb-5 grid gap-4 sm:grid-cols-[96px_1fr_auto] sm:items-center"><div className="mx-auto h-24"><JuniorAvatar character={run.character} size={96} mood={run.lives === 1 ? "confused" : "idle"} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CharacterBadge character={run.character} avatar={false} /><LifeHearts lives={run.lives} maxLives={run.maxLives} size={20} /><Link className="ml-2 text-sm font-semibold text-primary underline" href={`/materials/${id}/junior`}>후배 변경</Link></div><p className="mt-2 text-sm text-muted">졸업까지 <span className="font-bold text-ink tabular-nums">{run.progress.cleared} / {run.progress.total}</span> 챕터 · 합격 {run.passScore}점 · {run.examFormat === "OBJECTIVE" ? "객관식" : "서술형"} {CHARACTERS[run.character].questionCount}문항</p>{inFinalStage(run) && <p className="mt-1 text-sm font-semibold text-primary">{finalStageText(run)}</p>}{run.status !== "ACTIVE" && <p className="mt-1 text-xs text-danger">이 후배는 {run.status === "GRADUATED" ? "졸업했어요" : "떠났어요"}. 새 후배를 만나세요.</p>}</div>{inFinalStage(run) ? <FinalExamAction run={run} className="sm:w-48" /> : run.status !== "ACTIVE" ? <Link href={`/materials/${id}/junior`}><Button>새 후배 만나기</Button></Link> : null}</Card>}
        {run === null && <Card className="mb-5 flex flex-col items-center gap-3 border-primary bg-primary-soft p-5 text-center sm:flex-row sm:text-left"><JuniorAvatar character="KU_HARD" size={88} mood="talk" /><div className="min-w-0 flex-1"><p className="text-lg font-black">먼저 가르칠 후배를 골라 주세요</p><p className="mt-1 text-sm text-muted">후배마다 이해 방식·시험 형식·합격선이 다릅니다. 자료와 진도를 유지하면서 다른 후배를 선택할 수 있어요.</p></div><Link href={`/materials/${id}/junior`}><Button>후배 선택 →</Button></Link></Card>}
        <p className="mb-4 text-sm text-muted">한 번에 목차 하나를 가르칩니다. 순서는 자유입니다.</p><Card><h2 className="text-lg font-bold">목차 <span className="text-primary">{material.chapters.length}</span></h2>{material.chapters.length ? <ol className="mt-2">{material.chapters.map((chapter) => <ChapterRow key={chapter.chapterId} chapter={chapter} onStart={start} busy={busyChapter === chapter.chapterId} disabled={!!busyChapter || generating || run === undefined || !!runError} progress={run?.progress.chapters.find((p) => p.chapterId === chapter.chapterId)} />)}</ol> : <p className="mt-5 text-sm text-muted">목차가 비어 있습니다. 다시 생성해 주세요.</p>}</Card></>}
      <div className="mt-8 border-t border-line pt-5"><button className="text-sm font-semibold text-danger underline" disabled={generating || !!busyChapter} onClick={() => setDeleteOpen(true)}>자료 삭제</button></div>
    </>}
    <ConfirmDialog open={deleteOpen} title="자료를 삭제할까요?" description="자료와 연결된 목차가 삭제됩니다. 이 작업은 되돌릴 수 없습니다." busy={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={remove} />
  </>;
}
