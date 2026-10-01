"use client";
/**
 * [③] GAME OVER 씬 페이지 — GET /api/runs/[id] 로 캐릭터·자료를 읽는다. 읽지 못하면 ?c=&m= 쿼리로 대체(미리보기).
 */
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { gameApi } from "@/lib/client/game-api";
import { GameOverScene } from "@/components/game/scenes/GameOverScene";
import { JUNIOR_CHARACTERS, type JuniorCharacter } from "@/components/game/types";

function parseCharacter(value: string | null): JuniorCharacter | null {
  return (JUNIOR_CHARACTERS as readonly string[]).includes(value ?? "") ? (value as JuniorCharacter) : null;
}

export default function GameOverPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [info, setInfo] = useState<{ character: JuniorCharacter; materialId: string | null } | null>(null);
  const queryCharacter = parseCharacter(params.get("c"));
  const queryMaterial = params.get("m");

  useEffect(() => {
    let active = true;
    gameApi.getRun(id)
      .then((run) => active && setInfo({ character: run.character, materialId: run.materialId }))
      .catch(() => active && setInfo({ character: queryCharacter ?? "KU_HARD", materialId: queryMaterial }));
    return () => { active = false; };
  }, [id, queryCharacter, queryMaterial]);

  if (!info) return null;
  return <GameOverScene character={info.character} onNext={() => router.push(info.materialId ? `/materials/${encodeURIComponent(info.materialId)}/junior` : "/")} />;
}
