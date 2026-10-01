"use client";
/**
 * [③] 후배 선택 페이지. Step 2-A 에서 ①의 POST /api/runs 에 연결한다 — 지금은 선택 후 자료 페이지로 돌아간다.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { JuniorSelect } from "@/components/game/JuniorSelect";
import type { JuniorCharacter } from "@/components/game/types";

export default function JuniorSelectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState<JuniorCharacter | null>(null);

  async function select(character: JuniorCharacter) {
    setBusy(character);
    // TODO(③ Step 2-A): await createRun({ materialId: id, character }) → 자료 페이지로
    await new Promise((r) => window.setTimeout(r, 500));
    router.push(`/materials/${id}`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/materials/${id}`} className="mb-5 inline-block text-sm font-semibold text-muted hover:text-primary">← 자료로</Link>
      <JuniorSelect onSelect={select} busy={busy} />
    </div>
  );
}
