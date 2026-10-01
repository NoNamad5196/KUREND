import { Suspense } from "react";
import { WrongNoteList } from "@/components/wrong-notes/WrongNoteList";

export default function WrongNotesPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-muted">오답노트를 불러오는 중…</p>}>
      <WrongNoteList />
    </Suspense>
  );
}
