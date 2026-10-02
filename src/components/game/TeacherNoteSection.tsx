"use client";
/**
 * [③] 자료 페이지 "선배용 강의노트" 섹션 — 챕터별로 가르쳐야 할 것/이것만은/헷갈리기 쉬운/후배가 물어볼 질문을 펼쳐 본다.
 * 없는 챕터는 [만들기] 또는 [모두 만들기](순차)로 생성한다.
 */
import { useCallback, useEffect, useState } from "react";
import type { ChapterDto } from "@/contracts/types";
import type { TeacherNoteDto } from "@/contracts/game";
import { Button, Chip, Spinner } from "@/components/session/ui";
import { TeacherNoteBody } from "./TeacherNoteDrawer";
import { generateTeacherNote, loadTeacherNotes } from "./useTeacherNote";

export function TeacherNoteSection({ materialId, chapters }: { materialId: string; chapters: ChapterDto[] }) {
  const [notes, setNotes] = useState<Map<string, TeacherNoteDto> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadTeacherNotes(materialId).then((m) => active && setNotes(new Map(m))).catch((e) => active && setError(e instanceof Error ? e.message : "강의노트를 불러오지 못했어요."));
    return () => { active = false; };
  }, [materialId]);

  const generate = useCallback(async (chapterId: string) => {
    setBusy(chapterId); setError(null);
    try {
      const note = await generateTeacherNote(materialId, chapterId);
      setNotes((m) => new Map(m ?? []).set(chapterId, note));
      setOpen(chapterId);
    } catch (e) { setError(e instanceof Error ? e.message : "강의노트를 만들지 못했어요."); }
    finally { setBusy(null); }
  }, [materialId]);

  const generateAll = useCallback(async () => {
    setBusy("all"); setError(null);
    try {
      for (const c of chapters) {
        if (notes?.get(c.chapterId)) continue;
        const note = await generateTeacherNote(materialId, c.chapterId);
        setNotes((m) => new Map(m ?? []).set(c.chapterId, note));
      }
    } catch (e) { setError(e instanceof Error ? e.message : "강의노트를 만들지 못했어요."); }
    finally { setBusy(null); }
  }, [materialId, chapters, notes]);

  const missing = chapters.filter((c) => !notes?.get(c.chapterId)).length;
  return (
    <section className="mt-12 border-t border-line pt-6" aria-labelledby="teacher-note-section-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="teacher-note-section-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">선배용 강의노트</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">후배를 가르치기 전에 범위를 먼저 훑어보세요. 정답이 아니라 “무엇을 설명할지”만 담겨 있어요.</p>
        </div>
        {notes && missing > 0 && <Button size="sm" variant="secondary" loading={busy === "all"} disabled={!!busy} onClick={() => void generateAll()}>없는 노트 {missing}개 모두 만들기</Button>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-sm bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {!notes && !error && <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Spinner /> 강의노트를 확인하는 중…</p>}
      {notes && (
        <ol className="mt-6 divide-y divide-line border-y border-line">
          {chapters.map((c) => {
            const note = notes.get(c.chapterId);
            const isOpen = open === c.chapterId;
            return (
              <li key={c.chapterId} className="py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-8 shrink-0 font-mono text-xs text-muted">{c.order}</span>
                  <span className="min-w-0 flex-1 font-semibold">{c.title}</span>
                  {note ? (
                    <>
                      <Chip tone="ok">준비됨</Chip>
                      <Button size="sm" variant="ghost" onClick={() => setOpen(isOpen ? null : c.chapterId)}>{isOpen ? "접기" : "보기"}</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" loading={busy === c.chapterId} disabled={!!busy} onClick={() => void generate(c.chapterId)}>만들기</Button>
                  )}
                </div>
                {note && isOpen && <div className="mt-5 border-l border-line pl-5"><TeacherNoteBody note={note} /></div>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
