"use client";
/**
 * [③] GAME OVER 씬 페이지. Step 2-B 에서 ①의 GET /api/runs/[id] 로 캐릭터·자료를 읽는다 — 지금은 ?c=KU_HARD&m=<materialId> 로 미리보기.
 */
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { GameOverScene } from "@/components/game/scenes/GameOverScene";
import { JUNIOR_CHARACTERS, type JuniorCharacter } from "@/components/game/types";

export default function GameOverPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const c = params.get("c");
  const character: JuniorCharacter = (JUNIOR_CHARACTERS as readonly string[]).includes(c ?? "") ? (c as JuniorCharacter) : "KU_HARD";
  const materialId = params.get("m");
  void id; // TODO(③ Step 2-B): getRun(id) 로 character/materialId 조회
  return <GameOverScene character={character} onNext={() => router.push(materialId ? `/materials/${materialId}/junior` : "/")} />;
}
