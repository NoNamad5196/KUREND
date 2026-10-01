/**
 * 자료 페이지 목차 한 줄 — 챕터 제목·핵심 포인트·진행 표시(Run 이 있으면 통과/시도/최고점, 없으면 가르침/안정)·가르치기/이어하기 버튼.
 * materialId 를 넘기면 가르치기 앞에 "공부하기"(/materials/{id}/study/{chapterId}) 링크가 함께 보인다.
 */
import Link from "next/link";
import type { ChapterDto } from "@/contracts/types";
import type { RunChapterProgressDto } from "@/contracts/game";
import { routeForSession } from "@/lib/client/api";
import { Button, Chip } from "@/components/shell/ui";

function progressSymbol(chapter: ChapterDto, progress?: RunChapterProgressDto): { symbol: string; label: string } {
  if (progress) return progress.cleared ? { symbol: "✓", label: "통과" } : progress.attempts > 0 ? { symbol: "…", label: "도전 중" } : { symbol: "○", label: "미도전" };
  return chapter.stableAt ? { symbol: "★", label: "안정" } : chapter.taughtAt ? { symbol: "●", label: "가르침" } : { symbol: "○", label: "미가르침" };
}

export function ChapterRow({ chapter, onStart, busy, progress, disabled, materialId }: { chapter: ChapterDto; onStart: (chapterId: string) => void; busy: boolean; progress?: RunChapterProgressDto; disabled?: boolean; materialId?: string }) {
  const action = chapter.action;
  const { symbol, label } = progressSymbol(chapter, progress);
  const wide = materialId ? "flex-1 sm:flex-none" : "";
  const teach = action.kind === "CONTINUE" ? <Link aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} onClick={(event) => { if (disabled) event.preventDefault(); }} className={`inline-flex min-h-11 shrink-0 items-center justify-center k-button k-button-secondary px-5 py-3 text-sm ${wide}`} href={routeForSession({ sessionId: action.sessionId, status: action.status })}>이어하기 →</Link> : <Button variant={action.kind === "RETRY" || progress?.cleared ? "secondary" : "primary"} loading={busy} disabled={disabled} className={`shrink-0 ${wide}`} onClick={() => onStart(chapter.chapterId)}>{action.kind === "RETRY" || progress?.cleared ? "다시 가르치기" : "가르치기"} →</Button>;
  return <li className="flex flex-col gap-4 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-4"><span className="chapter-number">{chapter.order}</span><div><h3 className="text-lg font-semibold tracking-tight sm:text-xl">{chapter.title} <span className={progress?.cleared ? "ml-1 text-ok" : "ml-1 text-primary"} aria-label={label}>{symbol}</span></h3><div className="mt-2 flex flex-wrap gap-1.5">{chapter.points.map((point) => <Chip key={point}>{point}</Chip>)}</div>{progress && progress.attempts > 0 && <p className="mt-2 text-xs text-muted">{progress.cleared ? <span className="font-semibold text-ok">통과</span> : <span className="font-semibold text-warn">아직 미통과</span>} · 시도 {progress.attempts}회{progress.bestScore !== null && ` · 최고 ${progress.bestScore}점`}</p>}{!progress && (chapter.bestScore !== null || chapter.openGapCount > 0) && <p className="mt-2 text-xs text-muted">{chapter.bestScore !== null && `최고 ${chapter.bestScore}점`}{chapter.bestScore !== null && chapter.openGapCount > 0 && " · "}{chapter.openGapCount > 0 && `놓친 곳 ${chapter.openGapCount}개`}</p>}</div></div>{materialId ? <div className="flex shrink-0 items-center gap-2"><Link href={`/materials/${encodeURIComponent(materialId)}/study/${encodeURIComponent(chapter.chapterId)}`} className={`inline-flex min-h-11 items-center justify-center gap-1.5 k-button k-button-ghost px-4 py-3 text-sm text-primary ${wide}`} aria-label={`${chapter.title} 공부하기`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>공부하기</Link>{teach}</div> : teach}</li>;
}
