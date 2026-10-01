"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { gameApi } from "@/lib/client/game-api";
import { JuniorSelect } from "@/components/game/JuniorSelect";
import { Button } from "@/components/session/ui";
import type { JuniorCharacter } from "@/components/game/types";
import type { RunDto } from "@/contracts/game";
import type { MaterialDto } from "@/contracts/types";

export default function JuniorSelectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const chapterId = search.get("chapterId") || undefined;
  const sessionId = search.get("sessionId") || undefined;
  const [busy, setBusy] = useState<JuniorCharacter | null>(null);
  const [run, setRun] = useState<RunDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const selecting = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setRun(null);
    Promise.all([api.get<MaterialDto>(`/materials/${encodeURIComponent(id)}`), gameApi.getCurrentRun(id)])
      .then(([material, current]) => {
        if (!active) return;
        if (material.status !== "READY") { router.replace(`/materials/${id}`); return; }
        setRun(current);
      })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "학습 정보를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, router, attempt]);

  async function select(character: JuniorCharacter) {
    if (selecting.current || loading) return;
    selecting.current = true;
    setBusy(character); setError(null);
    try {
      const current = run ?? await gameApi.getCurrentRun(id);
      if (current) {
        const changed = await gameApi.changeCharacter(current.runId, { character, chapterId, sessionId });
        router.replace(changed.sessionId ? `/session/${changed.sessionId}/prepare` : `/materials/${id}`);
      } else {
        await gameApi.createRun({ materialId: id, character });
        router.replace(`/materials/${id}`);
      }
    } catch (failure) {
      // A conflict is not a successful selection. Reload authoritative state.
      if (failure instanceof ApiError && failure.status === 409) setRun(await gameApi.getCurrentRun(id).catch(() => null));
      setError(failure instanceof Error ? failure.message : "후배를 선택하지 못했어요. 다시 시도해 주세요.");
      setBusy(null);
    } finally { selecting.current = false; }
  }

  return <div className="mx-auto max-w-5xl">
    <Link href={`/materials/${id}`} className="mb-5 inline-block text-sm font-semibold text-muted hover:text-primary">← 자료로</Link>
    {error && <div role="alert" className="mb-4 rounded-sm bg-danger-soft p-3 text-sm text-danger">{error} <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button></div>}
    {loading ? <p role="status">학습 자료와 후배 정보를 불러오는 중…</p> : !error && <JuniorSelect onSelect={select} busy={busy}
      title={run ? "어떤 후배와 계속 공부할까요?" : undefined}
      subtitle={run ? "자료·목차·학습 진도는 그대로 유지해요. 후배를 바꾸면 새 대화로 시작합니다." : undefined} />}
  </div>;
}
