"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import type { MaterialDto, MaterialListItemDto } from "@/contracts/types";
import { Card, Chip, EmptyState, PageHeader } from "@/components/shell/ui";

export default function MapPage() {
  const [materials, setMaterials] = useState<MaterialDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get<MaterialListItemDto[]>("/materials").then((list) => Promise.all(list.map((item) => api.get<MaterialDto>(`/materials/${item.materialId}`)))).then(setMaterials).catch((e) => setError(e instanceof Error ? e.message : "지식 지도를 불러오지 못했습니다.")); }, []);
  const courses = materials ? Array.from(new Set(materials.map((m) => m.courseName))) : [];
  return <><PageHeader title="지식 지도" description="어떤 목차를 가르쳤고 어디를 다시 살펴봐야 하는지 한눈에 확인하세요." />{error && <Card role="alert" className="border-danger text-danger">{error}</Card>}{!materials && !error && <p className="py-20 text-center text-muted" role="status">지식 지도를 불러오는 중…</p>}{materials && (courses.length ? <div className="space-y-4">{courses.map((course) => <details key={course} open className="rounded-card border border-line bg-surface p-5 shadow-card"><summary className="cursor-pointer text-lg font-bold">{course}</summary><div className="mt-4 space-y-5">{materials.filter((m) => m.courseName === course).map((m) => <div key={m.materialId}><Link href={`/materials/${m.materialId}`} className="font-semibold text-primary hover:underline">{m.title} →</Link><ul className="mt-2 divide-y divide-line">{m.chapters.map((chapter) => <li key={chapter.chapterId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><Link href={`/materials/${m.materialId}`} className="hover:text-primary"><span className="mr-2 text-primary">{chapter.stableAt ? "★" : chapter.taughtAt ? "●" : "○"}</span>{chapter.title}</Link><div className="flex gap-2">{chapter.bestScore !== null && <Chip>{chapter.bestScore}점</Chip>}{chapter.openGapCount > 0 && <Chip tone="yellow">놓친 곳 {chapter.openGapCount}</Chip>}</div></li>)}</ul></div>)}</div></details>)}</div> : <EmptyState title="아직 지도가 비어 있습니다" description="자료를 올려 목차를 만들면 이곳에 표시됩니다." action={<Link href="/new" className="font-semibold text-primary underline">새 자료 올리기 →</Link>} />)}</>;
}
