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
  const tilt = [-2.5, 1.8, -1.2, 2.4][i % 4];
  return (
    <li className="al-polaroid list-none" style={{ ["--tilt" as string]: `${tilt}deg`, animationDelay: `${i * 80}ms` }}>
      <div className="rounded-[6px] border border-line bg-surface p-3 pb-4 shadow-card">
        <div className={`al-photo grid h-48 place-items-end justify-center overflow-hidden rounded-[3px] ${grad ? "" : "al-gone"}`}>
          <JuniorAvatar character={e.character} size={180} mood={grad ? "graduate" : "sad"} outfit={grad ? "grad" : e.character === "MALE_EASY" ? "soldiers" : e.character === "FEMALE_NORMAL" ? "casual" : "default"} label={meta.name} />
        </div>
        <p className="mt-3 text-center font-hand text-2xl leading-none text-paper-ink">{meta.name} · {e.courseName}</p>
        <p className="mt-1 text-center text-xs text-muted">{e.materialTitle}</p>
        {s ? (
          <dl className="mt-3 grid grid-cols-3 gap-1 text-center text-xs">
            <div><dt className="text-muted">함께한</dt><dd className="font-bold tabular-nums">{s.days}일</dd></div>
            <div><dt className="text-muted">통과</dt><dd className="font-bold tabular-nums">{s.chapters}챕터</dd></div>
            <div><dt className="text-muted">평균</dt><dd className="font-bold tabular-nums">{s.averageScore ?? "–"}점</dd></div>
            <div><dt className="text-muted">시험</dt><dd className="font-bold tabular-nums">{s.exams}회</dd></div>
            <div><dt className="text-muted">PERFECT</dt><dd className="font-bold tabular-nums">{s.perfectCount}</dd></div>
            <div><dt className="text-muted">LIFE</dt><dd className="font-bold tabular-nums">{s.finalLives}/{s.maxLives}</dd></div>
          </dl>
        ) : null}
        <p className="mt-3 text-center text-[11px] text-muted">{grad ? "졸업" : "떠난 날"} · {fmt(e.endedAt)}</p>
      </div>
    </li>
  );
}

export function AlbumPage() {
  const [album, setAlbum] = useState<AlbumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { gameApi.getAlbum().then(setAlbum).catch((e: unknown) => setError(e instanceof Error ? e.message : "졸업앨범을 불러오지 못했습니다.")); }, []);
  return (
    <>
      <PageHeader title="졸업앨범" description="선배가 끝까지 가르쳐 졸업시킨 후배들과, 아쉽게 떠나간 후배들의 기록이에요." />
      {error && <Card role="alert" className="border-danger text-danger">{error}</Card>}
      {!album && !error && <p className="py-20 text-center text-muted" role="status">졸업앨범을 펼치는 중…</p>}
      {album && album.graduated.length + album.departed.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <JuniorAvatar character="KU_HARD" size={140} mood="think" />
          <h2 className="text-lg font-bold">아직 졸업한 후배가 없어요</h2>
          <p className="max-w-sm text-sm text-muted">자료의 모든 챕터를 통과시키면 후배가 졸업하고, 이곳에 사진이 걸려요.</p>
          <Link href="/"><Button>가르치러 가기</Button></Link>
        </Card>
      )}
      {album && album.graduated.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold">🎓 졸업생 <span className="text-primary">{album.graduated.length}</span></h2>
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{album.graduated.map((e, i) => <Polaroid key={e.runId} e={e} i={i} />)}</ul>
        </section>
      )}
      {album && album.departed.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-bold">떠나간 후배 <span className="text-muted">{album.departed.length}</span></h2>
          <p className="mb-4 text-sm text-muted">LIFE 가 다 떨어져 떠난 후배들이에요. 자료는 그대로 남아 있으니 새 후배와 다시 도전해 보세요.</p>
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{album.departed.map((e, i) => <Polaroid key={e.runId} e={e} i={i} />)}</ul>
        </section>
      )}
    </>
  );
}
