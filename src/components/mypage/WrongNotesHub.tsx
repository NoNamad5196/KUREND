"use client";

import { stripMarkdownBold } from "@/lib/shared/plain-text";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { WrongNoteDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { Button, Chip } from "@/components/shell/ui";

export function WrongNotesHub() {
  const [notes, setNotes] = useState<WrongNoteDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    gameApi.listWrongNotes().then((result) => {
      if (active) setNotes(result);
    }).catch((error: unknown) => {
      if (active) setError(error instanceof Error ? error.message : "오답노트를 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, [attempt]);

  const pending = notes?.filter((note) => !note.userReason).length ?? 0;

  return <section className="archive-section" aria-labelledby="wrong-notes-heading">
    <header className="archive-section-heading">
      <span className="archive-index" aria-hidden="true">01</span>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="wrong-notes-heading">오답노트</h2>
          {notes && <Chip tone="green">{notes.length}개</Chip>}
        </div>
        <p>후배가 틀렸던 문제에서 내가 놓친 설명을 다시 확인해요.</p>
        {pending > 0 && <div className="mt-4"><Chip tone="yellow">복습할 오답 {pending}개</Chip></div>}
      </div>
    </header>
    <div className="archive-section-body">
      {error && <div role="alert"><p className="text-sm text-danger">{error}</p><Button type="button" variant="secondary" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>오답노트 다시 불러오기</Button></div>}
      {!notes && !error && <p role="status" className="py-8 text-sm text-muted">오답노트를 불러오는 중…</p>}
      {notes?.length === 0 && <div className="archive-empty">
        <p className="text-xl font-semibold">아직 모인 오답이 없어요</p>
        <p className="mt-3 text-sm leading-7 text-muted">후배가 시험에서 놓친 문제가 생기면 자동으로 모여요.</p>
        <Link href="/" className="text-link mt-5 inline-block text-sm font-semibold text-primary">후배 가르치러 가기 →</Link>
      </div>}
      {notes && notes.length > 0 && <ul className="archive-note-list">
        {notes.slice(0, 3).map((note, index) => <li key={note.wrongNoteId}>
          <Link href={`/wrong-notes/${note.wrongNoteId}`} className="archive-note-link">
            <span className="editorial-label pt-1" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="text-xs leading-5 text-muted">{note.materialTitle} · {note.chapterTitle}</p>
              <p className="mt-2 line-clamp-2 break-words text-lg font-semibold leading-7">{stripMarkdownBold(note.question)}</p>
              {note.missedConcepts.length > 0 && <p className="mt-2 line-clamp-1 text-xs text-muted">놓친 개념: {stripMarkdownBold(note.missedConcepts.join(", "))}</p>}
            </div>
            <span className="archive-arrow" aria-hidden="true">↗</span>
          </Link>
        </li>)}
      </ul>}
      <Link href="/wrong-notes" className="text-link mt-5 inline-flex min-h-11 items-center text-sm font-bold text-primary">오답노트 전체 보기 →</Link>
    </div>
  </section>;
}
