"use client";
/**
 * [③] GRADUATION 씬 페이지 — POST /api/runs/[id]/graduate 로 졸업 처리하고 요약을 보여준다.
 * 이미 졸업한 Run(409) 이면 GET /api/runs/[id] 로 캐릭터만 읽어 씬을 보여준다. 개발 중에는 ?c= 쿼리로 미리보기.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { GraduationSummaryDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { GraduationScene } from "@/components/game/scenes/GraduationScene";
import { JUNIOR_CHARACTERS, type JuniorCharacter } from "@/components/game/types";

export default function GraduationPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const c = params.get("c");
  const queryCharacter: JuniorCharacter | null = (JUNIOR_CHARACTERS as readonly string[]).includes(c ?? "") ? (c as JuniorCharacter) : null;
  const queryMaterial = params.get("m");
  const [state, setState] = useState<{ character: JuniorCharacter; materialId: string | null; summary: GraduationSummaryDto | null; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { run, summary } = await gameApi.graduate(id);
        if (active) setState({ character: run.character, materialId: run.materialId, summary, error: null });
      } catch (e) {
        try {
          const run = await gameApi.getRun(id);
          if (active) setState({ character: run.character, materialId: run.materialId, summary: null, error: e instanceof Error ? e.message : null });
        } catch {
          if (!active) return;
          if (process.env.NODE_ENV !== "production" && queryCharacter) {
            setState({ character: queryCharacter, materialId: queryMaterial, error: null, summary: { runId: id, character: queryCharacter, materialTitle: "4장 프로세스 스케줄링", courseName: "운영체제", days: 3, chapters: 6, exams: 9, averageScore: 86, perfectCount: 2, wrongNoteCount: 4, finalLives: 2, maxLives: 3, graduatedAt: new Date().toISOString() } });
          } else setState({ character: "KU_HARD", materialId: null, summary: null, error: e instanceof Error ? e.message : "졸업 정보를 불러오지 못했어요." });
        }
      }
    })();
    return () => { active = false; };
  }, [id, queryCharacter, queryMaterial]);

  if (!state) return null;
  return (
    <>
      <GraduationScene character={state.character} summary={state.summary} albumHref="/album" nextHref={state.materialId ? `/materials/${encodeURIComponent(state.materialId)}/junior` : "/"} />
      {state.error && !state.summary && <p role="alert" className="fixed inset-x-0 bottom-4 z-[96] mx-auto w-fit rounded-sm bg-danger-soft px-4 py-2 text-sm text-danger">{state.error}</p>}
    </>
  );
}
