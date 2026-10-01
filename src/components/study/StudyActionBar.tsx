"use client";
/**
 * 공부하기 — 하단 고정 바: 지금 가르칠 후배 + "{후배}에게 가르치러 가기 →"(주) / "목차로 돌아가기"(보조).
 * 모바일에서는 AppShell 하단 탭바(약 4rem) 위에 붙고, lg 이상에서는 화면 아래에서 1rem 띄운다.
 */
import Link from "next/link";
import type { ChapterAction } from "@/contracts/types";
import type { RunDto } from "@/contracts/game";
import { CHARACTER_META } from "@/components/game/characters";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { Button, Spinner } from "@/components/session/ui";

/** 버튼 문구 — 실제 이동 규칙은 StudyPage.go() 와 같다 */
export function teachLabel(run: RunDto | null | undefined, action: ChapterAction): string {
  const name = run && run.status === "ACTIVE" ? CHARACTER_META[run.character].name : null;
  if (action.kind === "CONTINUE") return name ? `${name}에게 이어서 가르치기 →` : "이어서 가르치기 →";
  if (run === null) return "후배 고르고 가르치기 →";
  if (run && run.status !== "ACTIVE") return "새 후배 만나기 →";
  return `${name ?? "후배"}에게 가르치러 가기 →`;
}

function JuniorInfo({ run, runError, onRetryRun }: { run: RunDto | null | undefined; runError: string | null; onRetryRun: () => void }) {
  if (runError) {
    return (
      <>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-danger/30 bg-danger-soft text-sm font-bold text-danger" aria-hidden="true">
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-danger">{runError}</p>
          <button type="button" onClick={onRetryRun} className="text-sm font-semibold text-primary underline underline-offset-2">
            다시 불러오기
          </button>
        </div>
      </>
    );
  }
  if (run === undefined) {
    return (
      <>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-bg text-muted" aria-hidden="true">
          <Spinner />
        </span>
        <p className="min-w-0 flex-1 text-sm text-muted" role="status">
          후배 정보를 불러오는 중…
        </p>
      </>
    );
  }
  if (run === null) {
    return (
      <>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-line bg-bg text-base font-bold text-muted" aria-hidden="true">
          ?
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">가르칠 후배</p>
          <p className="truncate text-sm font-bold">아직 고른 후배가 없어요</p>
        </div>
      </>
    );
  }
  const meta = CHARACTER_META[run.character];
  const active = run.status === "ACTIVE";
  return (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-end justify-center overflow-hidden rounded-full border border-line" style={{ background: meta.soft }} aria-hidden="true">
        <JuniorAvatar character={run.character} size={36} pose="still" mood={active ? "idle" : "sad"} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">가르칠 후배</p>
        <p className="truncate text-sm font-bold">
          {meta.name}
          <span className="ml-1.5 text-xs font-semibold text-muted">{active ? meta.difficulty : run.status === "GRADUATED" ? "졸업함" : "떠남"}</span>
        </p>
      </div>
    </>
  );
}

export function StudyActionBar({
  materialId,
  run,
  runError,
  onRetryRun,
  action,
  busy,
  error,
  ready,
  total,
  onGo,
}: {
  materialId: string;
  run: RunDto | null | undefined;
  runError: string | null;
  onRetryRun: () => void;
  action: ChapterAction;
  busy: boolean;
  error: string | null;
  ready: number;
  total: number;
  onGo: () => void;
}) {
  const blocked = action.kind !== "CONTINUE" && (run === undefined || !!runError);
  const backHref = `/materials/${encodeURIComponent(materialId)}`;
  return (
    <div className="sticky bottom-[calc(4.25rem_+_env(safe-area-inset-bottom))] z-20 mt-6 lg:bottom-4">
      {error && (
        <p role="alert" className="mb-2 rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger shadow-card">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface/95 p-3 shadow-card backdrop-blur sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <JuniorInfo run={run} runError={runError} onRetryRun={onRetryRun} />
          {total > 0 && (
            <span className="hidden shrink-0 rounded-full bg-bg px-2.5 py-1 text-xs font-semibold tabular-nums text-muted md:inline-flex">
              준비 {ready}/{total}
            </span>
          )}
          <Link href={backHref} className="shrink-0 text-sm font-semibold text-muted underline-offset-2 hover:text-primary hover:underline sm:hidden">
            목차로 돌아가기
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="hidden h-10 shrink-0 items-center justify-center rounded-sm border border-line bg-surface px-4 text-sm font-semibold hover:bg-bg sm:inline-flex"
          >
            목차로 돌아가기
          </Link>
          <Button className="w-full sm:w-auto" loading={busy} disabled={blocked} onClick={onGo}>
            {teachLabel(run, action)}
          </Button>
        </div>
      </div>
    </div>
  );
}
