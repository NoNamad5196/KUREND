/**
 * 세션 화면 공통 헤더: ← 자료명, 단계 칩, 챕터 제목, 부제, Stepper(1 가르치기 · 2 시험 · 3 결과 · 4 되짚기)
 */
import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionDto } from "@/contracts/types";
import { Chip, type ChipTone, SESSION_STEPS, Stepper } from "./ui";

export function StepperHeader({
  session,
  step,
  chipLabel,
  chipTone = "primary",
  subtitle,
  right,
  className,
}: {
  session: Pick<SessionDto, "material" | "chapter">;
  step: 1 | 2 | 3 | 4;
  chipLabel: string;
  chipTone?: ChipTone;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 sm:flex-1">
        <Link href={`/materials/${session.material.materialId}`} className="text-sm text-muted transition hover:text-ink">
          ← {session.material.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Chip tone={chipTone}>{chipLabel}</Chip>
          <h1 className="min-w-0 text-xl font-bold tracking-tight [text-wrap:balance] sm:text-2xl">{session.chapter.title}</h1>
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <Stepper steps={[...SESSION_STEPS]} current={step} className="mt-2 flex-wrap" />
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}
