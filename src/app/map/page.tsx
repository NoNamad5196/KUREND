"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import type { RunDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { CHARACTER_META } from "@/components/game/characters";
import type { MaterialDto, MaterialListItemDto } from "@/contracts/types";
import { Card, Chip, EmptyState, PageHeader } from "@/components/shell/ui";

export default function MapPage() {
  const [materials, setMaterials] = useState<MaterialDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunDto | null>>({});
  // [게임] 자료마다 지금 가르치는 후배의 진행도(통과·시도·최고점)
  useEffect(() => { if (!materials) return; Promise.all(materials.map((m) => gameApi.getCurrentRun(m.materialId).then((r) => [m.materialId, r] as const).catch(() => [m.materialId, null] as const))).then((rows) => setRuns(Object.fromEntries(rows))); }, [materials]);
  useEffect(() => { api.get<MaterialListItemDto[]>("/materials").then((list) => Promise.all(list.map((item) => api.get<MaterialDto>(`/materials/${item.materialId}`)))).then(setMaterials).catch((e) => setError(e instanceof Error ? e.message : "지식 지도를 불러오지 못했습니다.")); }, []);
  const courses = materials ? Array.from(new Set(materials.map((m) => m.courseName))) : [];
  return <><PageHeader title="지식 지도" description="어떤 목차를 가르쳤고 어디를 다시 살펴봐야 하는지 한눈에 확인하세요." />{error && <Card role="alert" className="border-danger text-danger">{error}</Card>}{!materials && !error && <p className="py-20 text-center text-muted" role="status">지식 지도를 불러오는 중…</p>}{materials && (courses.length ? <div className="knowledge-archive space-y-10">{courses.map((course) => <details key={course} open className="border-t border-line py-7"><summary className="cursor-pointer text-2xl font-bold tracking-tight sm:text-3xl">{course}</summary><div className="mt-8 space-y-8">{materials.filter((m) => m.courseName === course).map((m) => <div key={m.materialId}><div className="flex flex-wrap items-center gap-2"><Link href={`/materials/${m.materialId}`} className="font-semibold text-primary hover:underline">{m.title} →</Link>{runs[m.materialId] && <Chip tone="green">{CHARACTER_META[runs[m.materialId]!.character].name} · 통과 {runs[m.materialId]!.progress.cleared}/{runs[m.materialId]!.progress.total} · {"♥".repeat(runs[m.materialId]!.lives)}{"♡".repeat(runs[m.materialId]!.maxLives - runs[m.materialId]!.lives)}</Chip>}</div><ul className="mt-5 divide-y divide-line border-t border-line">{m.chapters.map((chapter) => <li key={chapter.chapterId} className="flex flex-wrap items-center justify-between gap-4 py-5 text-sm"><Link href={`/materials/${m.materialId}`} className="hover:text-primary"><span className="mr-2 text-primary">{chapter.stableAt ? "★" : chapter.taughtAt ? "●" : "○"}</span>{chapter.title}</Link><div className="flex flex-wrap gap-2">{(() => { const pr = runs[m.materialId]?.progress.chapters.find((c) => c.chapterId === chapter.chapterId); return pr ? (pr.cleared ? <Chip tone="green">통과 ✓ {pr.bestScore}점</Chip> : pr.attempts ? <Chip tone="red">도전 {pr.attempts}회 · 최고 {pr.bestScore}점</Chip> : <Chip>아직 안 배움</Chip>) : null; })()}{chapter.bestScore !== null && <Chip>{chapter.bestScore}점</Chip>}{chapter.openGapCount > 0 && <Chip tone="yellow">놓친 곳 {chapter.openGapCount}</Chip>}</div></li>)}</ul></div>)}</div></details>)}</div> : <EmptyState title="아직 지도가 비어 있습니다" description="자료를 올려 목차를 만들면 이곳에 표시됩니다." action={<Link href="/new" className="font-semibold text-primary underline">새 자료 올리기 →</Link>} />)}</>;
}
