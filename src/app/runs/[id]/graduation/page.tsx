"use client";
/**
 * [③] GRADUATION 씬 페이지. Step 2-B 에서 ①의 POST /api/runs/[id]/graduate 응답(summary)을 쓴다 — 지금은 ?c= 로 미리보기 + 고정 요약.
 */
import { useParams, useSearchParams } from "next/navigation";
import { GraduationScene } from "@/components/game/scenes/GraduationScene";
import { JUNIOR_CHARACTERS, type GraduationSummary, type JuniorCharacter } from "@/components/game/types";

export default function GraduationPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const c = params.get("c");
  const character: JuniorCharacter = (JUNIOR_CHARACTERS as readonly string[]).includes(c ?? "") ? (c as JuniorCharacter) : "KU_HARD";
  const materialId = params.get("m");
  const summary: GraduationSummary = {
    runId: id,
    character,
    materialTitle: "4장 프로세스 스케줄링",
    courseName: "운영체제",
    days: 3,
    chapters: 6,
    exams: 9,
    averageScore: 86,
    perfectCount: 2,
    wrongNoteCount: 4,
    finalLives: 2,
    maxLives: 3,
    graduatedAt: new Date().toISOString(),
  };
  return <GraduationScene character={character} summary={summary} nextHref={materialId ? `/materials/${materialId}/junior` : "/"} />;
}
