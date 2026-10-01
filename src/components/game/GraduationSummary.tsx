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
    <div className="border-t border-line py-3">
      <p className="text-[10px] leading-5 text-muted sm:text-[11px]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}<span className="ml-1 text-xs font-normal text-muted">{unit}</span></p>
    </div>
  );
}

export function GraduationSummary({ summary, albumHref, nextHref }: { summary: Summary; albumHref?: string; nextHref: string }) {
  const meta = CHARACTER_META[summary.character];
  return (
    <Card className="graduation-summary w-full max-w-lg p-5 text-left sm:p-7">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">KUREND / Graduation record</p>
      <p className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{meta.name}가 졸업했습니다!</p>
      <p className="mt-2 break-words text-xs leading-6 text-muted">{summary.courseName ? `${summary.courseName} · ` : ""}{summary.materialTitle}</p>
      <div className="mt-5 grid grid-cols-3 gap-x-4">
        <Stat label="함께 공부한 기간" value={summary.days} unit="일" />
        <Stat label="가르친 챕터" value={summary.chapters} unit="개" />
        <Stat label="시험" value={summary.exams} unit="회" />
        <Stat label="평균 점수" value={summary.averageScore ?? "–"} unit="점" />
        <Stat label="PERFECT" value={summary.perfectCount} unit="회" />
        <Stat label="작성한 오답노트" value={summary.wrongNoteCount} unit="개" />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs">
        <span className="font-mono tracking-wider text-muted">최종 LIFE</span>
        <LifeHearts lives={summary.finalLives} maxLives={summary.maxLives} size={19} animate={false} />
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {albumHref && <Link href={albumHref} className="flex-1"><Button variant="secondary" className="w-full">졸업 기록 보기</Button></Link>}
        <Link href={nextHref} className="flex-1"><Button className="w-full">새로운 후배 만나기 →</Button></Link>
      </div>
    </Card>
  );
}
