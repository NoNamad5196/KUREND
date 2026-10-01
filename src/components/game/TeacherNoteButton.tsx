"use client";
/**
 * [③] "강의노트" 버튼 → 선배용 강의노트 드로어. 열 때 ①의 teacher-note API 로 불러오고, 없으면 만들기(1회, 이후 캐시).
 */
import { useState } from "react";
import { gameApi } from "@/lib/client/game-api";
import { Button } from "@/components/session/ui";
import { TeacherNoteDrawer } from "./TeacherNoteDrawer";
import type { TeacherNote } from "./types";

export function TeacherNoteButton({ materialId, chapterId, chapterTitle, variant = "secondary", size, className, label = "강의노트" }: {
  materialId: string; chapterId: string; chapterTitle: string;
  variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" | "lg"; className?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<TeacherNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (note) return;
    setLoading(true);
    setError(null);
    try {
      const list = await gameApi.getTeacherNotes(materialId);
      setNote(list.chapters.find((c) => c.chapterId === chapterId)?.note ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "강의노트를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }
  async function generate() {
    setLoading(true);
    setError(null);
    try {
      setNote(await gameApi.requestTeacherNote(materialId, chapterId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "강의노트를 만들지 못했어요.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => void load()}>📒 {label}</Button>
      <TeacherNoteDrawer open={open} onClose={() => setOpen(false)} chapterTitle={chapterTitle} note={note} loading={loading} error={error} onGenerate={() => void generate()} />
    </>
  );
}
