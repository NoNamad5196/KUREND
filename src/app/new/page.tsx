"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import type { MaterialCreateResponse } from "@/contracts/types";
import { Button, Card, Chip, PageHeader } from "@/components/shell/ui";
import { FlowSteps } from "@/components/material/FlowSteps";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";

const MAX_SIZE = 10 * 1024 * 1024;
const SAMPLES = [
  { title: "운영체제 샘플", file: "/samples/operating-systems.md", course: "운영체제" },
  { title: "경제학 샘플", file: "/samples/economics.md", course: "경제학원론" },
];

export default function NewMaterialPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const [courseName, setCourseName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  function addFiles(incoming: FileList | File[]) {
    if (uploading.current) return;
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (!/\.(md|txt|pdf)$/i.test(file.name)) { setError("md, txt, pdf 파일만 올릴 수 있습니다."); return; }
      if (file.size > MAX_SIZE) { setError("파일은 각각 10MB 이하여야 합니다."); return; }
      if (next.length >= 5) { setError("파일은 최대 5개까지 올릴 수 있습니다."); return; }
      if (!next.some((existing) => existing.name === file.name && existing.size === file.size)) next.push(file);
    }
    setFiles(next); setError(null);
  }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }
  function onSelect(event: ChangeEvent<HTMLInputElement>) { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }
  async function selectSample(sample: typeof SAMPLES[number]) {
    if (uploading.current) return;
    try { const response = await fetch(sample.file); if (!response.ok) throw new Error("샘플 파일을 불러올 수 없습니다."); const text = await response.text(); setCourseName(sample.course); setFiles([new File([text], sample.file.split("/").at(-1) ?? "sample.md", { type: "text/markdown" })]); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "샘플을 불러올 수 없습니다."); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (uploading.current) return;
    if (!courseName.trim()) { setError("과목명을 입력해 주세요."); return; }
    if (!files.length) { setError("자료 파일을 하나 이상 선택해 주세요."); return; }
    uploading.current = true; setBusy(true); setError(null);
    const form = new FormData(); form.append("courseName", courseName.trim()); if (examDate) form.append("examDate", examDate); files.forEach((file) => form.append("files[]", file));
    try { const result = await api.upload<MaterialCreateResponse>("/materials", form); router.push(`/materials/${result.materialId}?generate=1`); }
    catch (e) { setError(e instanceof Error ? e.message : "자료를 올릴 수 없습니다."); setBusy(false); uploading.current = false; }
  }
  return <>
    <FlowSteps current={1} />
    <PageHeader eyebrow="THE NEXT CHAPTER" title="새 자료" description="공부할 자료를 올려 주세요. AI가 목차를 정리하면 후배와 첫 수업을 시작할 수 있어요." />
    <div className="upload-workspace"><form onSubmit={submit} className="upload-form"><fieldset disabled={busy} className="space-y-8"><Card><p className="editorial-label mb-5 text-muted">01 / CLASS DETAILS</p><label htmlFor="course" className="block text-sm font-bold">과목명 <span className="text-danger">*</span></label><input id="course" className="mt-2 w-full rounded-sm border border-line bg-surface px-4 py-3 outline-none focus:border-primary" placeholder="예: 운영체제" value={courseName} maxLength={80} onChange={(e) => setCourseName(e.target.value)} required /><label htmlFor="exam-date" className="mt-5 block text-sm font-bold">시험일 <span className="font-normal text-muted">선택</span></label><input id="exam-date" type="date" className="mt-2 rounded-sm border border-line bg-surface px-4 py-3 outline-none focus:border-primary" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></Card>
      <Card><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">강의 자료</h2><span className="text-xs text-muted">md · txt · pdf / 각 10MB / 최대 5개</span></div><input ref={inputRef} type="file" accept=".md,.txt,.pdf,text/plain,text/markdown,application/pdf" multiple className="sr-only" aria-label="자료 파일 선택" onChange={onSelect} /><div className={`upload-drop mt-4 border border-dashed p-8 text-center ${dragging ? "border-primary bg-primary-soft" : "border-line bg-bg"}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}><span className="mb-5 block text-4xl font-light text-primary" aria-hidden="true">↥</span><p className="font-semibold">파일을 이곳에 끌어다 놓으세요</p><p className="mt-1 text-sm text-muted">또는 컴퓨터에서 파일을 선택하세요.</p><Button type="button" variant="secondary" className="mt-4" onClick={() => inputRef.current?.click()}>파일 선택</Button></div>{files.length > 0 && <ul className="mt-4 space-y-2" aria-label="선택한 파일">{files.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-sm bg-bg px-3 py-2 text-sm"><span className="truncate">{file.name} <span className="text-muted">({(file.size / 1024).toFixed(0)} KB)</span></span><button type="button" className="font-bold text-danger" aria-label={`${file.name} 삭제`} onClick={() => setFiles(files.filter((_, i) => i !== index))}>삭제</button></li>)}</ul>}</Card>
      <Card><h2 className="font-bold">먼저 둘러보고 싶다면</h2><p className="mt-1 text-sm text-muted">샘플 자료를 선택해 바로 목차를 만들어 보세요.</p><div className="mt-4 flex flex-wrap gap-2">{SAMPLES.map((sample) => <button key={sample.title} type="button" onClick={() => selectSample(sample)}><Chip tone="green" className="cursor-pointer px-4 py-3 hover:bg-primary hover:text-primary-ink">{sample.title} ↗</Chip></button>)}</div></Card>
      {error && <p className="rounded-sm bg-danger-soft p-3 text-sm text-danger" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!courseName.trim() || !files.length}>{busy ? "파일 업로드·분석 중…" : "목차 뽑기 →"}</Button></div>
    </fieldset></form><aside className="upload-illustration"><span className="editorial-label">A NEW CHAPTER BEGINS</span><h2>알고 있는 것을<br />함께 아는 것으로.</h2><div className="upload-character" aria-hidden="true"><span className="upload-character-ring" /><JuniorAvatar character="KU_HARD" size={260} pose="still" /></div><div className="upload-illustration-caption"><span className="editorial-label">YOUR KNOWLEDGE, THEIR GROWTH.</span><p>자료를 올리고, 내 말로 설명하고.<br />후배와 함께 이해를 쌓아 가세요.</p></div></aside></div>
  </>;
}
