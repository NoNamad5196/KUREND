"use client";
/**
 * 졸업앨범 — 졸업시킨 후배(학사모) + 떠나간 후배(GAME OVER). GET /api/runs/album
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AlbumEntryDto, AlbumResponse } from "@/contracts/game";
import { gameApi } from "@/lib/client/game-api";
import { CHARACTER_META } from "@/components/game/characters";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { Button, Card, PageHeader } from "@/components/shell/ui";
import "./album.css";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

function Polaroid({ e, i }: { e: AlbumEntryDto; i: number }) {
  const meta = CHARACTER_META[e.character];
  const grad = e.status === "GRADUATED";
  const s = e.summary;

  return (
    <li className="al-polaroid list-none" style={{ animationDelay: `${Math.min(i, 5) * 80}ms` }}>
      <article className="al-entry">
        <div className="al-entry-meta"><span className="editorial-label">{String(i + 1).padStart(2, "0")} / {grad ? "GRADUATED" : "OUR MEMORY"}</span><span className="editorial-label">{fmt(e.endedAt)}</span></div>
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
            <div><dt className="text-muted">PERFECT</dt><dd className="font-bold tabular-nums">{s.perfectCount}</dd></div>
            <div><dt className="text-muted">LIFE</dt><dd className="font-bold tabular-nums">{s.finalLives}/{s.maxLives}</dd></div>
          </dl>
        ) : null}
        <p className="mt-5 text-[11px] text-muted">{grad ? "졸업" : "떠난 날"} · {fmt(e.endedAt)}</p>
        </div>
      </article>
    </li>
  );
}

export function AlbumPage() {
  const [album, setAlbum] = useState<AlbumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { gameApi.getAlbum().then(setAlbum).catch((e: unknown) => setError(e instanceof Error ? e.message : "졸업앨범을 불러오지 못했습니다.")); }, []);
  return (
    <div className="album-page page-enter">
      <PageHeader eyebrow="THE YEARBOOK / OUR JOURNEY" title="졸업앨범" description="선배가 끝까지 가르쳐 졸업시킨 후배들과, 아쉽게 떠나간 후배들의 기록이에요." />
      {error && <Card role="alert" className="border-danger text-danger">{error}</Card>}
      {!album && !error && <p className="py-20 text-center text-muted" role="status">졸업앨범을 펼치는 중…</p>}
      {album && album.graduated.length + album.departed.length === 0 && (
        <section className="al-empty">
          <div className="al-empty-portrait">
          <JuniorAvatar character="KU_HARD" size={280} mood="think" />
          </div>
          <div>
          <p className="editorial-label mb-5">THE FIRST CHAPTER IS YOURS</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">아직 졸업한<br />후배가 없어요</h2>
          <p className="mb-7 mt-4 max-w-sm text-sm leading-7 text-muted">모든 챕터를 통과하고 졸업시험(5문항)까지 붙으면 후배가 졸업하고, 이곳에 사진이 걸려요.</p>
          <Link href="/"><Button>가르치러 가기</Button></Link>
          </div>
        </section>
      )}
      {album && album.graduated.length > 0 && (
        <section className="al-section">
          <div className="al-section-heading"><p className="editorial-label">01 / A NEW BEGINNING</p><h2>졸업생 <span>{album.graduated.length}</span></h2></div>
          <ul className="al-gallery">{album.graduated.map((e, i) => <Polaroid key={e.runId} e={e} i={i} />)}</ul>
        </section>
      )}
      {album && album.departed.length > 0 && (
        <section className="al-section">
          <div className="al-section-heading"><p className="editorial-label">02 / UNTIL NEXT TIME</p><h2>떠나간 후배 <span>{album.departed.length}</span></h2></div>
          <p className="mb-4 text-sm text-muted">LIFE 가 다 떨어져 떠난 후배들이에요. 자료는 그대로 남아 있으니 새 후배와 다시 도전해 보세요.</p>
          <ul className="al-gallery al-gallery-departed">{album.departed.map((e, i) => <Polaroid key={e.runId} e={e} i={i} />)}</ul>
        </section>
      )}
    </div>
  );
}
