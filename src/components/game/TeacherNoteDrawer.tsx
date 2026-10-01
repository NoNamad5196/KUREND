"use client";
/**
 * [③] 선배용 강의노트 드로어 — 가르치는 도중 "잠깐 보기". SourceDrawer 와 같은 Drawer 패턴, 복사 유도를 줄이기 위해 요약만 보여준다.
 * 데이터 로딩은 호출 측(Step 3 에서 ①의 teacher-note API)이 담당: note / loading / error / onGenerate.
 */
import type { ReactNode } from "react";
import { Button, Drawer, Spinner } from "@/components/session/ui";
import type { TeacherNote } from "./types";

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-bg/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-black">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h3>
      <div className="mt-2 text-[15px] leading-7">{children}</div>
    </section>
  );
}

export function TeacherNoteBody({ note }: { note: TeacherNote }) {
  return (
    <div className="space-y-3">
      <Section title="이번에 가르쳐야 할 것" icon="📌">
        <ol className="list-decimal space-y-1 pl-5">{note.mustTeach.map((t) => <li key={t}>{t}</li>)}</ol>
      </Section>
      <Section title="이것만은 알고 가기" icon="✅">
        <ul className="list-disc space-y-1 pl-5">{note.keyTakeaways.map((t) => <li key={t}>{t}</li>)}</ul>
      </Section>
      <Section title="헷갈리기 쉬운 부분" icon="⚠️">
        <ul className="space-y-1">{note.confusing.map((t) => <li key={t}>{t}</li>)}</ul>
      </Section>
      <Section title="후배가 물어볼 수 있는 질문" icon="💬">
        <ul className="space-y-2">{note.likelyQuestions.map((t) => <li key={t} className="rounded-sm bg-accent-soft px-3 py-1.5 text-sm">“{t}”</li>)}</ul>
      </Section>
    </div>
  );
}

export function TeacherNoteDrawer({
  open,
  onClose,
  chapterTitle,
  note,
  loading,
  error,
  onGenerate,
}: {
  open: boolean;
  onClose: () => void;
  chapterTitle: string;
  note: TeacherNote | null;
  loading?: boolean;
  error?: string | null;
  onGenerate?: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title={`선배용 강의노트 · ${chapterTitle}`}>
      {note ? (
        <TeacherNoteBody note={note} />
      ) : loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted"><Spinner /> 강의노트를 정리하는 중…</div>
      ) : (
        <div className="space-y-3 py-6 text-sm">
          <p className={error ? "text-danger" : "text-muted"}>{error ?? "아직 이 챕터의 강의노트가 없어요."}</p>
          {onGenerate && <Button size="sm" variant="secondary" onClick={onGenerate}>강의노트 만들기</Button>}
        </div>
      )}
      <p className="mt-6 border-t border-line pt-3 text-xs text-muted">정답을 베끼는 대신, 무엇을 설명할지만 떠올리세요.</p>
    </Drawer>
  );
}
