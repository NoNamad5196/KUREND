"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, sse } from "@/lib/client/api";
import type { CreateSessionResponse, MaterialDto } from "@/contracts/types";
import { Button, Card, Chip, ConfirmDialog, PageHeader } from "@/components/shell/ui";
import type { RunDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { MaterialPreparation, type MaterialStep } from "@/components/material/MaterialPreparation";
import { TeacherNoteSection } from "@/components/game/TeacherNoteSection";
import { ChapterRow } from "@/components/material/ChapterRow";
import { FlowSteps } from "@/components/material/FlowSteps";
import { ChooseJuniorCard, MaterialRunCard } from "@/components/material/MaterialRunCard";

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
    <FlowSteps current={material?.status === "READY" ? 2 : 1} />
    <PageHeader title={material?.title || "자료"} description={material ? `${material.courseName}${material.examDate ? ` · 시험일 ${material.examDate}` : ""}` : "자료를 불러오는 중…"} />
    {error && <Card role="alert" className="mb-5 border-danger text-danger">{error}</Card>}
    {!material && !error && <p className="py-20 text-center text-muted" role="status">자료를 불러오는 중…</p>}
    {material && <>
      <div className="mb-5 flex flex-wrap gap-2">{material.sources.map((source) => <Chip key={source.sourceId} tone="green">{source.kind} · {source.fileName}</Chip>)}</div>
      {material.status !== "READY" ? <MaterialPreparation step={step} busy={generating} error={generating ? null : generationError || material.error || (material.status === "FAILED" ? "목차를 만들지 못했습니다. 다시 시도해 주세요." : null)} onRetry={() => void generate()} /> : <>
        {runError && <Card role="alert" className="mb-5 border-danger text-danger">{runError} <Button variant="secondary" onClick={() => void load().catch(() => undefined)}>다시 불러오기</Button></Card>}
        {run === undefined && !runError && <p role="status" className="mb-4 text-sm text-muted">후배 정보를 불러오는 중…</p>}
        {run && <MaterialRunCard run={run} materialId={id} />}
        {run === null && <ChooseJuniorCard materialId={id} />}
        <p className="mb-4 text-sm text-muted">한 번에 목차 하나를 가르칩니다. 순서는 자유입니다.</p><Card><h2 className="text-lg font-bold">목차 <span className="text-primary">{material.chapters.length}</span></h2>{material.chapters.length ? <ol className="mt-2">{material.chapters.map((chapter) => <ChapterRow key={chapter.chapterId} materialId={id} chapter={chapter} onStart={start} busy={busyChapter === chapter.chapterId} disabled={!!busyChapter || generating || run === undefined || !!runError} progress={run?.progress.chapters.find((p) => p.chapterId === chapter.chapterId)} />)}</ol> : <p className="mt-5 text-sm text-muted">목차가 비어 있습니다. 다시 생성해 주세요.</p>}</Card>{material.chapters.length > 0 && <TeacherNoteSection materialId={material.materialId} chapters={material.chapters} />}</>}
      <div className="mt-8 border-t border-line pt-5"><button className="text-sm font-semibold text-danger underline" disabled={generating || !!busyChapter} onClick={() => setDeleteOpen(true)}>자료 삭제</button></div>
    </>}
    <ConfirmDialog open={deleteOpen} title="자료를 삭제할까요?" description="자료와 연결된 목차가 삭제됩니다. 이 작업은 되돌릴 수 없습니다." busy={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={remove} />
  </>;
}
