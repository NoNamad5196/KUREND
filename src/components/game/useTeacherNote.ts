"use client";
/**
 * [③] 선배용 강의노트 로딩/생성 훅. 자료 단위 목록(GET /materials/{id}/teacher-note)을 한 번 받아 모듈 캐시에 두고,
 * 없는 챕터는 POST 로 1회 생성한다(①이 저장·캐시, ②가 LLM 생성).
 */
import { useCallback, useState } from "react";
import type { TeacherNoteDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";

const cache = new Map<string, TeacherNoteDto>();
const listed = new Set<string>();
const key = (materialId: string, chapterId: string) => `${materialId}:${chapterId}`;

export async function loadTeacherNotes(materialId: string): Promise<Map<string, TeacherNoteDto>> {
  if (!listed.has(materialId)) {
    const list = await gameApi.getTeacherNotes(materialId);
    for (const c of list.chapters) if (c.note) cache.set(key(materialId, c.chapterId), c.note);
    listed.add(materialId);
  }
  const out = new Map<string, TeacherNoteDto>();
  for (const [k, v] of cache) if (k.startsWith(`${materialId}:`)) out.set(k.slice(materialId.length + 1), v);
  return out;
}

export async function generateTeacherNote(materialId: string, chapterId: string): Promise<TeacherNoteDto> {
  const note = await gameApi.requestTeacherNote(materialId, chapterId);
  cache.set(key(materialId, chapterId), note);
  return note;
}

export function useTeacherNote(materialId: string, chapterId: string) {
  const [note, setNote] = useState<TeacherNoteDto | null>(cache.get(key(materialId, chapterId)) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 목록 조회 → 없으면 자동 생성(autoGenerate). */
  const load = useCallback(async (autoGenerate = true) => {
    const cached = cache.get(key(materialId, chapterId));
    if (cached) { setNote(cached); return; }
    setLoading(true); setError(null);
    try {
      const notes = await loadTeacherNotes(materialId);
      const mine = notes.get(chapterId) ?? null;
      if (mine) { setNote(mine); return; }
      if (autoGenerate) setNote(await generateTeacherNote(materialId, chapterId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "강의노트를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [materialId, chapterId]);

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try { setNote(await generateTeacherNote(materialId, chapterId)); }
    catch (e) { setError(e instanceof Error ? e.message : "강의노트를 만들지 못했어요."); }
    finally { setLoading(false); }
  }, [materialId, chapterId]);

  return { note, loading, error, load, generate };
}
