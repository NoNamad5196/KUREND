"use client";
/**
 * [③] 후배 선택 페이지 — POST /api/runs 로 Run 을 만들고 자료 페이지로 돌아간다. 이미 ACTIVE Run 이 있으면(409) 그대로 자료 페이지로.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiError } from "@/lib/client/api";
import { gameApi } from "@/lib/client/game-api";
import { JuniorSelect } from "@/components/game/JuniorSelect";
import type { JuniorCharacter } from "@/components/game/types";

export default function JuniorSelectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState<JuniorCharacter | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function select(character: JuniorCharacter) {
    setBusy(character); setError(null);
    try {
      await gameApi.createRun({ materialId: id, character });
      router.push(`/materials/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { router.push(`/materials/${id}`); return; }
      setError(e instanceof Error ? e.message : "후배를 데려오지 못했어요. 다시 시도해 주세요.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/materials/${id}`} className="mb-5 inline-block text-sm font-semibold text-muted hover:text-primary">← 자료로</Link>
      {error && <p role="alert" className="mb-4 rounded-sm bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <JuniorSelect onSelect={select} busy={busy} />
    </div>
  );
}
