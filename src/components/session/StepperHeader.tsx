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
    <header className={clsx("session-header flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-start lg:justify-between", className)}>
      <div className="min-w-0 sm:flex-1">
        <Link href={`/materials/${session.material.materialId}`} className="inline-block max-w-full break-words text-xs text-muted transition hover:text-primary">
          ← {session.material.title}
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Chip tone={chipTone}>{chipLabel}</Chip>
          <h1 className="min-w-0 basis-full break-words text-[clamp(1.65rem,4vw,2.8rem)] font-bold leading-tight tracking-[-0.03em] [text-wrap:balance]">{session.chapter.title}</h1>
        </div>
        {subtitle && <p className="mt-3 text-sm leading-6 text-muted">{subtitle}</p>}
        <Stepper steps={[...SESSION_STEPS]} current={step} className="mt-5 flex-wrap" />
      </div>
      {right && <div className="flex flex-wrap items-center gap-2 lg:max-w-[320px] lg:justify-end">{right}</div>}
    </header>
  );
}
