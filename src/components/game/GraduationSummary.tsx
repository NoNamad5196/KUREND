/**
 * [③] 졸업 결과 카드 — 함께한 기간·가르친 챕터·시험·평균·PERFECT·오답노트·최종 LIFE + [졸업 기록 보기][새로운 후배 만나기]
 */
import Link from "next/link";
import { Button, Card } from "@/components/session/ui";
import { CHARACTER_META } from "./characters";
import { LifeHearts } from "./LifeHearts";
import type { GraduationSummary as Summary } from "./types";

function Stat({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="rounded-card bg-bg px-3 py-3 text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums">{value}<span className="ml-0.5 text-xs font-semibold text-muted">{unit}</span></p>
    </div>
  );
}

export function GraduationSummary({ summary, albumHref, nextHref }: { summary: Summary; albumHref?: string; nextHref: string }) {
  const meta = CHARACTER_META[summary.character];
  return (
    <Card className="w-full max-w-md p-5 text-center">
      <p className="text-xl font-black">{meta.name}가 졸업했습니다!</p>
      <p className="mt-1 text-sm text-muted">{summary.courseName ? `${summary.courseName} · ` : ""}{summary.materialTitle}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="함께 공부한 기간" value={summary.days} unit="일" />
        <Stat label="가르친 챕터" value={summary.chapters} unit="개" />
        <Stat label="시험" value={summary.exams} unit="회" />
        <Stat label="평균 점수" value={summary.averageScore ?? "–"} unit="점" />
        <Stat label="PERFECT" value={summary.perfectCount} unit="회" />
        <Stat label="작성한 오답노트" value={summary.wrongNoteCount} unit="개" />
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 text-sm">
        <span className="text-muted">최종 LIFE</span>
        <LifeHearts lives={summary.finalLives} maxLives={summary.maxLives} size={22} animate={false} />
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {albumHref && <Link href={albumHref} className="flex-1"><Button variant="secondary" className="w-full">졸업 기록 보기</Button></Link>}
        <Link href={nextHref} className="flex-1"><Button className="w-full">새로운 후배 만나기 →</Button></Link>
      </div>
    </Card>
  );
}
