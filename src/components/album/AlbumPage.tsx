"use client";
/**
 * [미졸업] 재학생·졸업 직전·졸업 실패 후배 명단 · [졸업앨범] 졸업시킨 후배(학사모) 사진.
 * 졸업하면 미졸업에서 사라지고 졸업앨범에 사진이 걸린다. GET /api/runs/album
 */
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FINAL_QUESTION_COUNT, type AlbumEntryDto, type AlbumResponse } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { rosterNote, rosterOf, type RosterEntry } from "@/lib/client/album-roster";
import { CHARACTER_META } from "@/components/game/characters";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { Button, Card, PageHeader } from "@/components/shell/ui";
import "./album.css";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
const hearts = (lives: number, maxLives: number) => "♥".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, maxLives - lives));

function Polaroid({ e, i }: { e: AlbumEntryDto; i: number }) {
  const meta = CHARACTER_META[e.character];
  const grad = e.status === "GRADUATED";
  const s = e.summary;

  return (
    <li className="al-polaroid list-none" style={{ animationDelay: `${Math.min(i, 5) * 80}ms` }}>
      <article className="al-entry">
        <div className="al-entry-meta"><span className="editorial-label">{String(i + 1).padStart(2, "0")} / {grad ? "졸업" : "떠나간 후배"}</span><span className="editorial-label">{fmt(e.endedAt)}</span></div>
        <div className={`al-photo ${grad ? "" : "al-gone"}`}>
          <JuniorAvatar character={e.character} size={320} mood={grad ? "graduate" : "sad"} outfit={grad ? "grad" : e.character === "MALE_EASY" ? "soldiers" : e.character === "FEMALE_NORMAL" ? "casual" : "default"} label={meta.name} />
        </div>
        <div className="al-caption"><h3>{meta.name}</h3><p className="mt-2 text-xs text-muted">{e.courseName}</p>
        <p className="mt-1 break-words text-sm">{e.materialTitle}</p>
        {s ? (
          <dl className="al-entry-stats">
            <div><dt className="text-muted">함께한</dt><dd className="font-bold tabular-nums">{s.days}일</dd></div>
            <div><dt className="text-muted">통과</dt><dd className="font-bold tabular-nums">{s.chapters}챕터</dd></div>
            <div><dt className="text-muted">평균</dt><dd className="font-bold tabular-nums">{s.averageScore ?? "–"}점</dd></div>
            <div><dt className="text-muted">시험</dt><dd className="font-bold tabular-nums">{s.exams}회</dd></div>
            <div><dt className="text-muted">만점</dt><dd className="font-bold tabular-nums">{s.perfectCount}</dd></div>
            <div><dt className="text-muted">남은 체력</dt><dd className="font-bold tabular-nums">{s.finalLives}/{s.maxLives}</dd></div>
          </dl>
        ) : null}
        <p className="mt-5 text-[11px] text-muted">{grad ? "졸업" : "떠난 날"} · {fmt(e.endedAt)}</p>
        </div>
      </article>
    </li>
  );
}

/** 미졸업 카드: 재학생은 이어서 가르치기, 졸업 직전은 졸업시험·졸업하기, 졸업 실패는 새 후배로 다시 도전 */
function RosterCard({ e, i }: { e: RosterEntry; i: number }) {
  const meta = CHARACTER_META[e.character];
  const failed = e.status === "FAILED";
  return (
    <li className="al-roster-card" data-status={e.status} style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
      <div className="al-roster-photo">
        <JuniorAvatar character={e.character} size={210} mood={failed ? "sad" : e.canGraduate ? "graduate" : e.status === "NEAR_GRADUATION" ? "think" : "idle"} outfit={e.canGraduate && !failed ? "grad" : "default"} label={meta.name} />
      </div>
      <div className="al-roster-body">
        <div className="flex items-start justify-between gap-3">
          <h3>{meta.name}</h3>
          <span className={clsx("mt-1 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", failed ? "bg-danger-soft text-danger" : e.status === "NEAR_GRADUATION" ? "bg-accent-soft text-ink" : "bg-primary-soft text-primary")}>{e.label}</span>
        </div>
        <p className="mt-2 text-xs text-muted">{e.courseName}</p>
        <p className="mt-1 break-words text-sm font-semibold">{e.materialTitle}</p>
        <p className="mt-2 text-xs leading-5 text-muted">{rosterNote(e)}</p>
        <dl className="al-roster-stats">
          <div><dt className="text-muted">통과</dt><dd className="tabular-nums">{e.total !== null ? `${e.cleared}/${e.total}` : `${e.cleared}챕터`}</dd></div>
          <div><dt className="text-muted">체력</dt><dd className="tabular-nums tracking-tight" aria-label={`체력 ${e.lives} / ${e.maxLives}`}>{hearts(e.lives, e.maxLives)}</dd></div>
          <div><dt className="text-muted">{failed ? "떠난 날" : "함께한"}</dt><dd className="tabular-nums">{failed && e.endedAt ? new Date(e.endedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : `${e.days}일`}</dd></div>
        </dl>
        <div className="al-roster-actions">
          {failed ? (
            <Link href={`/materials/${encodeURIComponent(e.materialId)}/junior`}><Button variant="secondary" className="min-h-10 px-4 text-sm">새 후배와 다시 도전</Button></Link>
          ) : e.canGraduate ? (
            <Link href={`/runs/${encodeURIComponent(e.runId)}/graduation`}><Button className="min-h-10 px-4 text-sm">졸업하기 →</Button></Link>
          ) : (
            <Link href={`/materials/${encodeURIComponent(e.materialId)}`}><Button className="min-h-10 px-4 text-sm">이어서 가르치기 →</Button></Link>
          )}
        </div>
      </div>
    </li>
  );
}

type Tab = "enrolled" | "graduated";

export function AlbumPage() {
  const [album, setAlbum] = useState<AlbumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  useEffect(() => { gameApi.getAlbum().then(setAlbum).catch((e: unknown) => setError(e instanceof Error ? e.message : "졸업앨범을 불러오지 못했습니다.")); }, []);
  const roster = useMemo(() => (album ? rosterOf(album) : []), [album]);
  // 가르치는 후배가 있으면 미졸업부터, 없으면 졸업앨범부터 연다
  const current: Tab = tab ?? (roster.length > 0 || !album?.graduated.length ? "enrolled" : "graduated");
  const tabButton = (key: Tab, title: string, count: number) => (
    <button type="button" role="tab" id={`al-tab-${key}`} aria-selected={current === key} aria-controls={`al-panel-${key}`} className={clsx("al-tab", current === key && "is-active")} onClick={() => setTab(key)}>
      {title}<span>{count}</span>
    </button>
  );
  return (
    <div className="album-page page-enter">
      <PageHeader title="졸업앨범" description="재학생·졸업 직전·졸업 실패 후배는 미졸업에, 졸업 성공한 후배는 졸업앨범에 걸려요." />
      {error && <Card role="alert" className="border-danger text-danger">{error}</Card>}
      {!album && !error && <p className="py-20 text-center text-muted" role="status">졸업앨범을 펼치는 중…</p>}
      {album && (
        <>
          <div className="al-tabs" role="tablist" aria-label="미졸업 · 졸업앨범">
            {tabButton("enrolled", "미졸업", roster.length)}
            {tabButton("graduated", "졸업앨범", album.graduated.length)}
          </div>
          {current === "enrolled" && (
            <section id="al-panel-enrolled" role="tabpanel" aria-labelledby="al-tab-enrolled" className="al-section !mt-6">
              {roster.length ? (
                <>
                  <p className="text-sm text-muted">후배의 상태는 네 가지예요 — 가르칠 목차가 남은 <b>재학생</b>, 목차를 모두 통과해 최종 졸업시험만 남은 <b>졸업 직전</b>, 체력이 다해 떠난 <b>졸업 실패</b>, 그리고 졸업식을 마쳐 졸업앨범으로 옮겨 가는 <b>졸업 성공</b>.</p>
                  <ul className="al-roster">{roster.map((e, i) => <RosterCard key={e.key} e={e} i={i} />)}</ul>
                </>
              ) : (
                <div className="al-empty">
                  <div className="al-empty-portrait"><JuniorAvatar character="MALE_EASY" size={280} mood="think" /></div>
                  <div>
                    <h2 className="text-3xl font-semibold leading-tight tracking-tight">아직 가르치는<br />후배가 없어요</h2>
                    <p className="mb-7 mt-4 max-w-sm text-sm leading-7 text-muted">자료를 올리고 후배를 고르면 이곳에 재학생으로 들어와요. 자료 하나에 후배 한 명씩, 여러 명을 동시에 가르칠 수 있어요.</p>
                    <Link href="/"><Button>가르치러 가기</Button></Link>
                  </div>
                </div>
              )}
            </section>
          )}
          {current === "graduated" && (
            <section id="al-panel-graduated" role="tabpanel" aria-labelledby="al-tab-graduated" className="al-section !mt-6">
              {album.graduated.length ? (
                <ul className="al-gallery">{album.graduated.map((e, i) => <Polaroid key={e.runId} e={e} i={i} />)}</ul>
              ) : (
                <div className="al-empty">
                  <div className="al-empty-portrait"><JuniorAvatar character="KU_HARD" size={280} mood="think" /></div>
                  <div>
                    <h2 className="text-3xl font-semibold leading-tight tracking-tight">아직 졸업한<br />후배가 없어요</h2>
                    <p className="mb-7 mt-4 max-w-sm text-sm leading-7 text-muted">모든 챕터를 통과하고 졸업시험({FINAL_QUESTION_COUNT}문항)까지 붙어 졸업식을 마치면, 미졸업에서 졸업앨범으로 옮겨 와 사진이 걸려요.</p>
                    <Link href="/"><Button>가르치러 가기</Button></Link>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
