"use client";
/**
 * 준비 화면용 "기다리는 동안 강의노트 미리 보기" — 후배가 시험 문제를 만드는 15초 남짓을 공부 시간으로 쓴다.
 * 없으면 자동 생성(한 번 만들면 저장), 실패해도 준비 흐름은 막지 않는다.
 */
import { useEffect } from "react";
import { Spinner } from "@/components/session/ui";
import { TeacherNoteBody } from "./TeacherNoteDrawer";
import { useTeacherNote } from "./useTeacherNote";

export function TeacherNotePreview({ materialId, chapterId }: { materialId: string; chapterId: string }) {
  const { note, loading, error, load } = useTeacherNote(materialId, chapterId);
  useEffect(() => { void load(); }, [load]);
  if (error) return null;
  return (
    <section className="border-t border-line pt-6" aria-labelledby="note-preview-heading">
      <p className="editorial-label mb-3 text-muted">WHILE YOU WAIT</p>
      <h3 id="note-preview-heading" className="text-xl font-semibold tracking-tight">기다리는 동안 강의노트 훑어보기</h3>
      <p className="mt-2 text-xs leading-5 text-muted">무엇을 설명할지 미리 떠올려 두면 수업이 훨씬 빨라져요.</p>
      <div className="mt-4 max-h-[46vh] overflow-y-auto border-l-2 border-primary bg-surface p-4 pr-3">
        {note ? <TeacherNoteBody note={note} /> : loading ? <p className="flex items-center gap-2 py-6 text-sm text-muted"><Spinner /> 강의노트를 정리하는 중…</p> : null}
      </div>
    </section>
  );
}
