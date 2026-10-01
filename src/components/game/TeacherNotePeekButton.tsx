"use client";
/**
 * [③] 가르치는 도중 "강의노트" 버튼 → Drawer. 열 때 목록을 읽고 없으면 자동 생성한다.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/session/ui";
import { TeacherNoteDrawer } from "./TeacherNoteDrawer";
import { useTeacherNote } from "./useTeacherNote";

export function TeacherNotePeekButton({ materialId, chapterId, chapterTitle, className }: { materialId: string; chapterId: string; chapterTitle: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const { note, loading, error, load, generate } = useTeacherNote(materialId, chapterId);
  useEffect(() => { if (open) void load(); }, [open, load]);
  return (
    <>
      <Button variant="secondary" className={className} onClick={() => setOpen(true)}>강의노트</Button>
      <TeacherNoteDrawer open={open} onClose={() => setOpen(false)} chapterTitle={chapterTitle} note={note} loading={loading} error={error} onGenerate={() => void generate()} />
    </>
  );
}
