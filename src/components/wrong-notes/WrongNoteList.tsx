"use client";
/**
 * 오답노트 목록. 틀린(WRONG/PARTIAL) 문항은 채점 후 자동으로 들어온다. 자료별 필터, "이유 쓰기 전" 표시.
 */
import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { WrongNoteDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { Mascot } from "@/components/mascot/Mascot";
import { Button, Card, Chip, PageHeader } from "@/components/shell/ui";
import "./wrong-notes.css";

function relativeDate(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Date(value).toLocaleDateString("ko-KR");
}

export const VERDICT_TEXT = { WRONG: "오답", PARTIAL: "부분", CORRECT: "정답" } as const;

export function WrongNoteList() {
  const params = useSearchParams();
  const router = useRouter();
  const materialId = params.get("materialId");
  const [notes, setNotes] = useState<WrongNoteDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyTodo, setOnlyTodo] = useState(false);

  useEffect(() => {
    gameApi.listWrongNotes().then(setNotes).catch((e: unknown) => setError(e instanceof Error ? e.message : "오답노트를 불러오지 못했습니다."));
  }, []);

  const materials = useMemo(() => {
    const map = new Map<string, { title: string; courseName: string; count: number }>();
    for (const n of notes ?? []) {
      const key = n.materialTitle + "|" + n.courseName;
      const cur = map.get(key) ?? { title: n.materialTitle, courseName: n.courseName, count: 0 };
      cur.count++;
      map.set(key, cur);
    }
    return [...map.entries()];
  }, [notes]);
  const [materialKey, setMaterialKey] = useState<string | null>(null);
  // ?materialId= 로 들어오면 그 자료로 필터 (목록 응답의 자료 키로 변환)
  useEffect(() => {
    if (!materialId || !notes) return;
    gameApi.listWrongNotes(materialId).then((ns) => { if (ns[0]) setMaterialKey(ns[0].materialTitle + "|" + ns[0].courseName); }).catch(() => {});
  }, [materialId, notes]);

  const visible = (notes ?? []).filter((n) => (!materialKey || n.materialTitle + "|" + n.courseName === materialKey) && (!onlyTodo || !n.userReason));
  const todo = (notes ?? []).filter((n) => !n.userReason).length;

  return (
    <>
      <PageHeader title="오답노트" description="새내기가 틀린 문항은 자동으로 모입니다. 왜 틀렸는지 먼저 생각해 보고, 다시 가르쳐 보세요." />
      {error && <Card role="alert" className="border-danger text-danger">{error}</Card>}
      {!notes && !error && <p className="py-20 text-center text-muted" role="status">오답노트를 불러오는 중…</p>}
      {notes && notes.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Mascot state="praise" size={110} />
          <h2 className="text-lg font-bold">아직 오답이 없어요</h2>
          <p className="max-w-sm text-sm text-muted">새내기가 시험에서 틀린 문항이 생기면 여기에 자동으로 모입니다.</p>
          <Button onClick={() => router.push("/")}>가르치러 가기</Button>
        </Card>
      )}
      {notes && notes.length > 0 && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="필터">
            <button type="button" onClick={() => setMaterialKey(null)} className={clsx("rounded-full border px-3 py-1.5 text-xs font-semibold", !materialKey ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:bg-bg")}>
              전체 {notes.length}
            </button>
            {materials.map(([key, m]) => (
              <button key={key} type="button" onClick={() => setMaterialKey(key)} className={clsx("rounded-full border px-3 py-1.5 text-xs font-semibold", materialKey === key ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:bg-bg")}>
                {m.courseName} · {m.title} {m.count}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
              <input id="wn-only-todo" type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} className="accent-[var(--primary)]" />
              이유 안 쓴 것만 ({todo})
            </label>
          </div>
          <Card className="overflow-hidden !p-0">
            <ul className="wn-stagger divide-y divide-line">
              {visible.map((n) => (
                <li key={n.wrongNoteId}>
                  <Link href={`/wrong-notes/${n.wrongNoteId}`} className="grid gap-2 px-5 py-4 hover:bg-bg sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={n.verdict === "WRONG" ? "red" : "yellow"}>{VERDICT_TEXT[n.verdict]} · {n.score}/{n.maxScore}</Chip>
                        <span className="text-xs text-muted">{n.courseName} · {n.chapterTitle} · {relativeDate(n.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 break-words font-semibold">{n.question}</p>
                      {n.missedConcepts.length > 0 && <p className="mt-1 text-xs text-muted">놓친 개념: {n.missedConcepts.join(", ")}</p>}
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      {n.userReason ? <Chip tone="green">분석 완료</Chip> : <Chip tone="yellow">이유 쓰기 전</Chip>}
                      <span className="font-bold text-primary" aria-hidden>→</span>
                    </div>
                  </Link>
                </li>
              ))}
              {visible.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">조건에 맞는 오답노트가 없어요.</li>}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
