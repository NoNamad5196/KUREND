"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { HomeDto } from "@/contracts/types";
import type { TeacherNoteListResponse } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { TeacherNoteBody } from "@/components/game/TeacherNoteDrawer";
import { Button, Chip } from "@/components/shell/ui";

type MaterialNotes =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; chapters: TeacherNoteListResponse["chapters"] };

export function TeacherNoteCollection({ courses }: { courses: HomeDto["courses"] }) {
  const materials = useMemo(() => courses.flatMap((course) => course.materials.map((material) => ({ ...material, courseName: course.courseName }))), [courses]);
  const [results, setResults] = useState<Record<string, MaterialNotes>>({});
  const generation = useRef(0);

  const loadMaterial = useCallback(async (materialId: string, requestGeneration: number) => {
    setResults((previous) => ({ ...previous, [materialId]: { status: "loading" } }));
    try {
      // 조회만 한다. 이 허브를 여는 것으로 노트를 새로 생성하지 않는다.
      const result = await gameApi.getTeacherNotes(materialId);
      if (generation.current === requestGeneration) setResults((previous) => ({ ...previous, [materialId]: { status: "ready", chapters: result.chapters } }));
    } catch (error) {
      if (generation.current === requestGeneration) setResults((previous) => ({ ...previous, [materialId]: { status: "error", message: error instanceof Error ? error.message : "학습노트를 불러오지 못했습니다." } }));
    }
  }, []);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    // 한 자료의 실패가 다른 자료의 노트를 가리지 않도록 각각 상태를 유지한다.
    void Promise.allSettled(materials.map((material) => loadMaterial(material.materialId, requestGeneration)));
    return () => { generation.current = requestGeneration + 1; };
  }, [materials, loadMaterial]);

  if (materials.length === 0) return <div className="archive-empty">
    <p className="font-semibold">첫 자료부터 학습노트를 모아 볼까요?</p>
    <p className="mt-2 text-sm text-muted">자료를 올리고 가르치기를 준비하면, 만들어 둔 강의노트를 여기서 다시 볼 수 있어요.</p>
    <Link href="/new" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary hover:underline">첫 자료 올리기 →</Link>
  </div>;

  return <div className="archive-materials">
    {materials.map((material) => {
      const result = results[material.materialId];
      const noteCount = result?.status === "ready" ? result.chapters.filter((chapter) => chapter.note).length : null;
      return <article className="archive-material" key={material.materialId}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{material.courseName}</p>
            <h3 className="mt-2 break-words text-2xl font-semibold tracking-tight">{material.title}</h3>
          </div>
          {noteCount !== null && <Chip tone={noteCount > 0 ? "green" : "neutral"}>학습노트 {noteCount}개</Chip>}
        </div>
        {!result || result.status === "loading" ? <p role="status" className="mt-4 text-sm text-muted">이 자료의 학습노트를 불러오는 중…</p> : result.status === "error" ? <div role="alert" className="mt-4">
          <p className="text-sm text-danger">{result.message}</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => void loadMaterial(material.materialId, generation.current)}>이 자료 다시 불러오기</Button>
        </div> : <>
          {noteCount === 0 && <p className="mt-4 text-sm text-muted">아직 만들어진 학습노트가 없어요. 자료에서 가르치기를 준비하며 강의노트를 열어 보세요.</p>}
          {result.chapters.length > 0 && <ul className="mt-5 divide-y divide-line">
            {result.chapters.map((chapter) => <li key={chapter.chapterId} className="py-3">
              {chapter.note ? <details className="archive-chapter group">
                <summary className="cursor-pointer py-2 font-semibold leading-7 text-primary focus-visible:outline-2 focus-visible:outline-primary">{chapter.title}<span className="ml-2 text-xs font-normal text-muted">노트 보기</span></summary>
                <div className="archive-note-content"><TeacherNoteBody note={chapter.note} /></div>
              </details> : <div className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-sm font-semibold">{chapter.title}</span><span className="text-xs text-muted">아직 노트 없음</span></div>}
            </li>)}
          </ul>}
        </>}
        <Link href={`/materials/${material.materialId}`} className="text-link mt-4 inline-flex min-h-11 items-center text-sm font-bold text-primary">이 자료로 가르치기 →</Link>
      </article>;
    })}
  </div>;
}
