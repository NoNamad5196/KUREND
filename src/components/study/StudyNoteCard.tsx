"use client";
/**
 * 공부하기 — 왼쪽 "선배용 강의노트" 카드. 핵심 포인트(chapter.points) 칩 + TeacherNoteBody.
 * 노트 로딩/생성은 호출 측(useTeacherNote)이 담당하고, 여기서는 상태별 화면만 그린다.
 */
import clsx from "clsx";
import { stripMarkdownBold } from "@/lib/shared/plain-text";
import type { TeacherNoteDto } from "@/contracts/game";
import { TeacherNoteBody } from "@/components/game/TeacherNoteDrawer";
import { Button, Card, Spinner } from "@/components/session/ui";

function NoteSkeleton() {
  return (
    <div>
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> 강의노트를 정리하는 중… 처음 한 번은 조금 걸릴 수 있어요.
      </p>
      <div className="mt-3 space-y-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-card border border-line bg-bg/60 p-4">
            <div className="h-3.5 w-1/3 rounded bg-line" />
            <div className="mt-3 h-3 w-full rounded bg-line/70" />
            <div className="mt-2 h-3 w-4/5 rounded bg-line/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudyNoteCard({
  note,
  loading,
  error,
  onRetry,
  points,
  className,
}: {
  note: TeacherNoteDto | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  points: string[];
  className?: string;
}) {
  return (
    <Card className={clsx("p-4 sm:p-5", className)}>
      <h2 className="text-lg font-bold">선배용 강의노트</h2>
      <p className="mt-1 text-sm text-muted">정답이 아니라 “무엇을 설명할지”만 담았어요. 훑어보고 내 말로 바꿔 보세요.</p>

      {points.length > 0 && (
        <section className="mt-4" aria-labelledby="study-key-points">
          <h3 id="study-key-points" className="text-xs font-bold text-muted">
            핵심 포인트
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {points.map((point, i) => (
              <li key={`${i}:${point}`} className="max-w-full">
                <span className="inline-flex max-w-full items-center rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary [overflow-wrap:anywhere]">
                  {stripMarkdownBold(point)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4">
        {note ? (
          <TeacherNoteBody note={note} />
        ) : error && !loading ? (
          <div role="alert" className="rounded-sm border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
            <p>{error}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={onRetry}>
              다시 시도
            </Button>
          </div>
        ) : (
          <NoteSkeleton />
        )}
      </div>
    </Card>
  );
}
