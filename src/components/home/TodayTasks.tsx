"use client";
/**
 * 홈 "오늘 할 일" — 지금 상태에서 바로 할 수 있는 다음 행동 3~4개를 골라 보여준다.
 * 이어하기(진행 중 세션) · LIFE 위기 · 졸업 가능 · 다음 수업 미리 공부 · 이유 안 쓴 오답노트 · 시험 D-day.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { HomeDto } from "@/contracts/types";
import type { RunDto, WrongNoteDto } from "@/contracts/game";
import { routeForSession } from "@/lib/client/api";
import { gameApi } from "@/lib/client/game-api";
import { CHARACTER_META } from "@/components/game/characters";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { withJosa } from "@/components/game/JuniorOrMascot";
import { inFinalStage } from "@/components/game/FinalExamAction";

type Task = { key: string; icon: string; title: string; detail: string; href: string; cta: string; tone: "primary" | "danger" | "accent" | "default" };

function buildTasks(home: HomeDto, run: RunDto | null, notes: WrongNoteDto[]): Task[] {
  const tasks: Task[] = [];
  const resume = home.courses.flatMap((c) => c.materials).find((m) => m.resume)?.resume;
  if (run && run.status === "ACTIVE" && run.lives === 1) tasks.push({ key: "life", icon: "💔", title: "LIFE가 1개 남았어요", detail: `이번 시험에서 ${run.passScore}점을 넘지 못하면 ${withJosa(CHARACTER_META[run.character].name, "이/가")} 떠나요. 먼저 공부하고 가르쳐 보세요.`, href: run.next ? `/materials/${run.materialId}/study/${run.next.chapterId}` : `/materials/${run.materialId}`, cta: "공부하러 가기", tone: "danger" });
  if (run && inFinalStage(run) && !run.canGraduate) tasks.push({ key: "final", icon: "📝", title: run.finalExam.status === "IN_PROGRESS" ? "졸업시험을 이어서 보세요" : "졸업시험만 남았어요!", detail: `모든 챕터를 통과했어요. 자료 전체에서 ${run.finalExam.questionCount}문항 · 합격 ${run.passScore}점.`, href: `/materials/${run.materialId}`, cta: "졸업시험 보러 가기", tone: "accent" });
  if (run && run.canGraduate && run.status === "ACTIVE") tasks.push({ key: "grad", icon: "🎓", title: "졸업할 수 있어요!", detail: "모든 챕터를 통과했어요. 졸업식을 열어 주세요.", href: `/runs/${run.runId}/graduation`, cta: "졸업하기", tone: "accent" });
  if (resume) tasks.push({ key: "resume", icon: "▶", title: `이어서: ${resume.chapterTitle}`, detail: `${resume.stageLabel} 단계에서 멈췄어요.`, href: routeForSession(resume), cta: "이어하기", tone: "primary" });
  if (run && run.status === "ACTIVE" && run.next && !resume) tasks.push({ key: "study", icon: "📖", title: `다음 수업: ${run.next.title}`, detail: "가르치기 전에 강의노트로 범위를 먼저 훑어보세요.", href: `/materials/${run.materialId}/study/${run.next.chapterId}`, cta: "미리 공부하기", tone: "default" });
  const unwritten = notes.filter((n) => !n.userReason?.trim());
  if (unwritten.length) tasks.push({ key: "notes", icon: "✎", title: `오답노트 ${unwritten.length}개가 기다려요`, detail: "왜 틀렸는지 내 생각을 먼저 적고 AI 분석과 비교해 보세요.", href: "/wrong-notes", cta: "이유 쓰기", tone: "default" });
  const soon = home.courses.filter((c) => c.dDay !== null && c.dDay >= 0 && c.dDay <= 7).sort((a, b) => (a.dDay ?? 99) - (b.dDay ?? 99))[0];
  if (soon) tasks.push({ key: "dday", icon: "📅", title: `${soon.courseName} 시험 ${soon.dDay === 0 ? "D-Day" : `D-${soon.dDay}`}`, detail: "남은 목차를 후배에게 가르치며 복습해요.", href: soon.materials[0] ? `/materials/${soon.materials[0].materialId}` : "/", cta: "자료 보기", tone: "accent" });
  if (!run && home.courses.length) tasks.push({ key: "meet", icon: "🧑‍🎓", title: "가르칠 후배를 골라 주세요", detail: "남학생·여학생·KU 중 한 명을 골라 졸업시켜 보세요.", href: `/materials/${home.courses[0].materials[0]?.materialId}/junior`, cta: "후배 고르기", tone: "primary" });
  if (!home.courses.length) tasks.push({ key: "first", icon: "＋", title: "첫 자료를 올려 보세요", detail: "강의노트·PDF를 올리면 목차를 나눠 줘요.", href: "/new", cta: "자료 올리기", tone: "primary" });
  return tasks.slice(0, 4);
}

const TONE: Record<Task["tone"], string> = {
  primary: "border-primary/30 bg-primary-soft/60",
  danger: "border-danger/30 bg-danger-soft/70",
  accent: "border-accent/50 bg-accent-soft/70",
  default: "border-line bg-surface",
};

export function TodayTasks({ home, run }: { home: HomeDto; run: RunDto | null | undefined }) {
  const [notes, setNotes] = useState<WrongNoteDto[]>([]);
  useEffect(() => { gameApi.listWrongNotes().then(setNotes).catch(() => setNotes([])); }, []);
  if (run === undefined) return null;
  const tasks = buildTasks(home, run, notes);
  if (!tasks.length) return null;
  const line = run && run.next ? `선배, 오늘은 “${run.next.title}” 배우고 싶어요!` : run ? "선배, 오늘도 잘 부탁해요!" : "선배, 저희 중 누구를 가르쳐 주실 거예요?";
  return (
    <section aria-labelledby="today-heading" className="mb-8">
      <div className="mb-3 flex items-end gap-3">
        <JuniorAvatar character={run?.character ?? "KU_HARD"} size={54} mood="talk" />
        <div className="relative mb-1 rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2 text-sm font-semibold shadow-card">{line}</div>
      </div>
      <h2 id="today-heading" className="mb-3 text-lg font-bold">오늘 할 일</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {tasks.map((t) => (
          <li key={t.key}>
            <Link href={t.href} className={clsx("group flex h-full items-start gap-3 rounded-card border p-4 transition hover:-translate-y-0.5 hover:shadow-card", TONE[t.tone])}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-lg shadow-sm" aria-hidden="true">{t.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-6">{t.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">{t.detail}</span>
              </span>
              <span className="shrink-0 self-center text-xs font-bold text-primary group-hover:underline">{t.cta} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
