"use client";
/**
 * 오답노트 상세. 선배가 "왜 틀렸을까"를 먼저 써야 AI 분석(진단·비교·자료 근거)이 열린다. 그 다음 [다시 가르치기].
 */
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { WrongNoteDto } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { LearningErrorFeedback } from "@/components/exam/LearningErrorFeedback";
import { Choices } from "@/components/exam/Choices";
import { Mascot } from "@/components/mascot/Mascot";
import { Button, Card, Chip } from "@/components/shell/ui";
import { VERDICT_TEXT } from "./WrongNoteList";
import "./wrong-notes.css";

export function WrongNoteDetail({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState<WrongNoteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [reteaching, setReteaching] = useState(false);

  useEffect(() => {
    gameApi.getWrongNote(id).then((n) => { setNote(n); setReason(n.userReason); }).catch((e: unknown) => setError(e instanceof Error ? e.message : "오답노트를 불러오지 못했습니다."));
  }, [id]);

  async function save() {
    if (!reason.trim()) return;
    setSaving(true); setError(null);
    try {
      const updated = await gameApi.updateWrongNote(id, { userReason: reason.trim() });
      setNote(updated); setEditing(false); setJustUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }
  async function reteach() {
    setReteaching(true); setError(null);
    try {
      const r = await gameApi.reteachWrongNote(id);
      router.push(`/session/${encodeURIComponent(r.sessionId)}/prepare`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 가르치기를 시작하지 못했습니다.");
      setReteaching(false);
    }
  }

  if (error && !note) return <Card role="alert" className="border-danger text-danger">{error} <Link href="/wrong-notes" className="ml-2 underline">목록으로</Link></Card>;
  if (!note) return <p className="py-20 text-center text-muted" role="status">오답노트를 불러오는 중…</p>;

  const unlocked = !!note.userReason && !editing;
  return (
    <div className="wn-detail page-enter space-y-8">
      <div>
        <Link href="/wrong-notes" className="text-link text-sm font-semibold text-muted hover:text-primary">← 오답노트</Link>
        <p className="editorial-label mb-4 mt-8">REVIEW / A CHANCE TO UNDERSTAND</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip tone={note.verdict === "WRONG" ? "red" : "yellow"}>{VERDICT_TEXT[note.verdict]}</Chip>
          <span className="text-sm text-muted">{note.courseName} · {note.materialTitle} · {note.chapterTitle}</span>
        </div>
      </div>

      <div className="wn-detail-layout">
        <div className="min-w-0 space-y-8">
          {/* 시험지 */}
          <Card className="wn-paper wn-rise">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="editorial-label">문항 {note.qid.replace("q", "")}</p><span className="wn-score">{note.score}<small> / {note.maxScore}</small></span></div>
            <h1 className="wn-question">{stripMarkdownBold(note.question)}</h1>
            {note.choices && <Choices choices={note.choices} answer={note.answer} className="mt-4" />}
            <div className="wn-answer">
              <p className="text-xs font-bold text-muted">새내기의 답</p>
              <p className="mt-3 whitespace-pre-wrap break-words text-xl leading-8">{stripMarkdownBold(note.answer) || "(답하지 못함)"}</p>
            </div>
            <LearningErrorFeedback errorReason={note.errorReason} evidenceQuote={note.evidenceQuote} sourceExcerpt={note.sourceExcerpt} />
          </Card>

          {/* 선배가 먼저 쓰는 이유 */}
          <Card className="wn-reflection wn-rise [animation-delay:.08s]">
            <p className="editorial-label mb-4">01 / YOUR REFLECTION</p>
            <h2 className="text-2xl font-semibold tracking-tight">왜 틀렸을까요?</h2>
            <p className="mt-1 text-sm text-muted">위 근거를 살펴보고, 내 설명에서 무엇이 빠졌거나 잘못됐는지 적어 보세요. 이유를 저장하면 내 생각과 분석을 비교할 수 있어요.</p>
            {unlocked ? (
              <div className="mt-3 rounded-sm bg-primary-soft p-4">
                <p className="text-xs font-bold text-primary">내가 쓴 이유</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{note.userReason}</p>
                <button type="button" className="mt-2 text-xs font-semibold text-muted underline hover:text-ink" onClick={() => { setEditing(true); setReason(note.userReason); }}>고치기</button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <label htmlFor="wn-reason" className="sr-only">틀린 이유</label>
                <textarea
                  id="wn-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="예: 가격과 수요량이 반대로 움직인다는 걸 거꾸로 설명했다."
                  className="w-full resize-y rounded-[3px] border border-line bg-surface px-4 py-4 text-sm leading-7 outline-none focus:border-primary"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted tabular-nums">{reason.length} / 1000</span>
                  <div className="flex flex-wrap gap-2">
                    {editing && <Button variant="secondary" onClick={() => setEditing(false)}>취소</Button>}
                    <Button loading={saving} disabled={!reason.trim()} onClick={() => void save()}>저장하고 AI 분석 보기</Button>
                  </div>
                </div>
              </div>
            )}
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </Card>
        </div>

        {/* AI 분석 (이유를 써야 열림) */}
        <aside className="wn-analysis min-w-0 space-y-6">
          <Card className={clsx("wn-analysis-paper space-y-6", unlocked ? (justUnlocked ? "wn-unlock" : "wn-rise") : "wn-locked")}>
            <div className="flex items-center gap-3">
              <Mascot state={unlocked ? (note.aiComparison?.startsWith("맞아요") ? "praise" : "thinking") : "idle"} size={64} />
              <div>
                <p className="editorial-label mb-2">02 / INSIGHT</p><h2 className="text-xl font-semibold">AI 분석</h2>
                {!unlocked && <p className="text-xs text-muted">이유를 먼저 쓰면 열려요</p>}
              </div>
            </div>
            <div className={clsx("space-y-4", !unlocked && "wn-blur")} aria-hidden={!unlocked}>
              {unlocked && note.aiComparison && (
                <div className="rounded-sm border border-primary/30 bg-primary-soft p-3 text-sm leading-6">
                  <p className="text-xs font-bold text-primary">내 생각과 비교</p>
                  <p className="mt-1">{stripMarkdownBold(note.aiComparison)}</p>
                </div>
              )}
              <div className="text-sm leading-6">
                <p className="text-xs font-bold text-muted">진단</p>
                <p className="mt-1">{unlocked ? stripMarkdownBold(note.aiDiagnosis) : "새내기 답안과 자료를 비교한 진단이 여기에 나와요. 먼저 스스로 생각해 보세요."}</p>
              </div>
              {note.missedConcepts.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted">놓친 개념</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">{note.missedConcepts.map((c) => <Chip key={c} tone="red">{unlocked ? stripMarkdownBold(c) : "●●●●"}</Chip>)}</div>
                </div>
              )}
              {note.sourceExcerpt && (
                <blockquote className="border-l-4 border-accent bg-accent-soft/60 p-3 text-sm leading-6">
                  <p className="text-xs font-bold text-warn">자료에서는</p>
                  <p className="mt-1">{unlocked ? note.sourceExcerpt : "자료의 해당 문장이 여기에 나와요."}</p>
                </blockquote>
              )}
            </div>
          </Card>
          <Card className="wn-reteach space-y-3">
            <p className="text-sm font-semibold">이 개념만 콕 집어 다시 가르쳐 볼까요?</p>
            <p className="text-xs text-muted">같은 목차로 새 세션을 열고, 놓친 개념을 집중해서 설명합니다.</p>
            <Button className="w-full" loading={reteaching} onClick={() => void reteach()}>다시 가르치기 →</Button>
            <Link href={`/session/${encodeURIComponent(note.sessionId)}/result`} className="block text-center text-xs font-semibold text-muted underline hover:text-ink">원래 시험 결과 보기</Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
