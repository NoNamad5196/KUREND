"use client";
/**
 * 공부하기 화면 — 원 서비스 흐름 "자료 등록 → 목차 확인 → 공부하기 → 가르치기" 의 3단계.
 * 왼쪽: 선배용 강의노트(없으면 자동 생성) + 핵심 포인트 · 오른쪽: 이 목차의 자료 원문(검색·강조)
 * 아래: 후배 예상 질문 셀프 체크 · 하단 고정: 현재 후배 + "가르치러 가기"(자료 페이지와 같은 규칙으로 세션 시작).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreateSessionResponse, MaterialDto } from "@/contracts/types";
import type { RunDto } from "@/contracts/game";
import { api, routeForSession } from "@/lib/client/api";
import { gameApi } from "@/lib/client/game-api";
import { useTeacherNote } from "@/components/game/useTeacherNote";
import { CHARACTER_META } from "@/components/game/characters";
import { Button, Card, Chip, EmptyState, Spinner } from "@/components/session/ui";
import { SelfCheck, checklistItems, useStudyChecklist } from "./SelfCheck";
import { SourceExcerpt } from "./SourceExcerpt";
import { StudyActionBar } from "./StudyActionBar";
import { StudyNoteCard } from "./StudyNoteCard";
import { FlowSteps } from "@/components/material/FlowSteps";

const enc = encodeURIComponent;
const errorText = (failure: unknown, fallback: string) => (failure instanceof Error && failure.message ? failure.message : fallback);
const linkBtn = "inline-flex h-9 items-center justify-center rounded-sm border border-line bg-surface px-3 text-sm font-semibold hover:bg-bg";

export function StudyPage({ materialId, chapterId }: { materialId: string; chapterId: string }) {
  const router = useRouter();
  const [material, setMaterial] = useState<MaterialDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [run, setRun] = useState<RunDto | null | undefined>(undefined);
  const [runError, setRunError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([api.get<MaterialDto>(`/materials/${enc(materialId)}`), gameApi.getCurrentRun(materialId)]).then(([loaded, current]) => {
      if (!active) return;
      if (loaded.status === "fulfilled") {
        setMaterial(loaded.value);
        setLoadError(null);
      } else {
        setLoadError(errorText(loaded.reason, "학습 자료를 불러오지 못했어요."));
      }
      if (current.status === "fulfilled") {
        setRun(current.value);
        setRunError(null);
      } else {
        setRun(undefined);
        setRunError("후배 정보를 불러오지 못했어요.");
      }
    });
    return () => {
      active = false;
    };
  }, [materialId, attempt]);

  const reload = useCallback(() => {
    setLoadError(null);
    setRunError(null);
    setAttempt((n) => n + 1);
  }, []);

  const chapter = useMemo(() => material?.chapters.find((c) => c.chapterId === chapterId) ?? null, [material, chapterId]);

  // 강의노트: 목차가 확인된 뒤 한 번만 불러온다(없으면 자동 생성 — StrictMode 에서도 중복 생성 요청 방지).
  const { note, loading: noteLoading, error: noteError, load: loadNote } = useTeacherNote(materialId, chapterId);
  const noteRequested = useRef(false);
  const hasChapter = chapter !== null;
  useEffect(() => {
    if (!hasChapter || noteRequested.current) return;
    noteRequested.current = true;
    void loadNote();
  }, [hasChapter, loadNote]);

  const { checked, toggle } = useStudyChecklist(chapterId);
  const points = useMemo(() => chapter?.points ?? [], [chapter]);
  const items = useMemo(
    () => (note ? checklistItems(note.likelyQuestions, points) : noteError && !noteLoading ? checklistItems([], points) : []),
    [note, noteError, noteLoading, points],
  );
  const ready = items.filter((item) => checked.includes(item.key)).length;

  const go = useCallback(async () => {
    if (!chapter || startingRef.current) return;
    const action = chapter.action;
    if (action.kind === "CONTINUE") {
      startingRef.current = true;
      setStarting(true);
      router.push(routeForSession({ sessionId: action.sessionId, status: action.status }));
      return;
    }
    if (run === undefined || runError) return;
    if (run === null || run.status !== "ACTIVE") {
      router.push(`/materials/${enc(materialId)}/junior`);
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setStartError(null);
    try {
      const result = await api.post<CreateSessionResponse>("/sessions", { chapterId: chapter.chapterId, runId: run.runId });
      router.push(`/session/${result.sessionId}/prepare`);
    } catch (failure) {
      setStartError(errorText(failure, "세션을 시작하지 못했어요. 다시 시도해 주세요."));
      setStarting(false);
      startingRef.current = false;
      setAttempt((n) => n + 1); // 이미 진행 중인 세션 등 최신 상태(chapter.action)를 다시 받아온다
    }
  }, [chapter, run, runError, router, materialId]);

  if (!material) {
    if (loadError) {
      return (
        <Card>
          <EmptyState
            title="공부할 내용을 불러오지 못했어요"
            description={loadError}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={reload}>다시 시도</Button>
                <Link href={`/materials/${enc(materialId)}`} className={linkBtn}>
                  자료로 돌아가기
                </Link>
              </div>
            }
          />
        </Card>
      );
    }
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-24 text-muted">
        <Spinner /> 공부할 내용을 불러오는 중…
      </p>
    );
  }

  if (!chapter) {
    const notReady = material.status !== "READY";
    return (
      <Card>
        <EmptyState
          title={notReady ? "목차가 아직 준비되지 않았어요" : "목차를 찾을 수 없어요"}
          description={notReady ? "자료 페이지에서 목차를 먼저 만들어 주세요." : "삭제되었거나 다른 자료의 목차예요. 자료 페이지에서 다시 골라 주세요."}
          action={
            <Link href={`/materials/${enc(materialId)}`} className={linkBtn}>
              ← {material.title}
            </Link>
          }
        />
      </Card>
    );
  }

  const index = material.chapters.findIndex((c) => c.chapterId === chapter.chapterId);
  const prev = index > 0 ? material.chapters[index - 1] : null;
  const next = index >= 0 && index < material.chapters.length - 1 ? material.chapters[index + 1] : null;
  const progress = run?.progress.chapters.find((p) => p.chapterId === chapter.chapterId);
  const source = material.sources.find((s) => s.sourceId === chapter.sourceId);
  const juniorName = run && run.status === "ACTIVE" ? CHARACTER_META[run.character].name : null;
  const subtitle = progress?.cleared
    ? `통과한 목차예요${progress.bestScore !== null ? ` · 최고 ${progress.bestScore}점` : ""}. 다시 훑어보고 더 단단하게 가르쳐 보세요.`
    : progress && progress.attempts > 0
      ? `시도 ${progress.attempts}회${progress.bestScore !== null ? ` · 최고 ${progress.bestScore}점` : ""}. 놓친 부분을 다시 공부해 보세요.`
      : "가르치기 전에 범위를 훑고, 후배가 물어볼 질문에 답할 수 있는지 확인해요.";
  const studyHref = (id: string) => `/materials/${enc(materialId)}/study/${enc(id)}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <Link href={`/materials/${enc(materialId)}`} className="inline-block max-w-full truncate text-sm text-muted transition hover:text-ink">
            ← {material.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Chip tone="primary">공부하기</Chip>
            <h1 className="min-w-0 text-xl font-bold tracking-tight [overflow-wrap:anywhere] [text-wrap:balance] sm:text-2xl">
              <span className="mr-1.5 text-primary">{chapter.order}.</span>
              {chapter.title}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <FlowSteps current={3} className="mb-0 mt-2.5" />
        </div>
        {(prev || next) && (
          <nav aria-label="다른 목차 공부하기" className="flex shrink-0 flex-wrap items-center gap-2">
            {prev && (
              <Link href={studyHref(prev.chapterId)} className={linkBtn} title={prev.title}>
                ← 이전 목차
              </Link>
            )}
            {next && (
              <Link href={studyHref(next.chapterId)} className={linkBtn} title={next.title}>
                다음 목차 →
              </Link>
            )}
          </nav>
        )}
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <StudyNoteCard note={note} loading={noteLoading} error={noteError} onRetry={() => void loadNote()} points={points} />
        </div>
        <div className="min-w-0 lg:sticky lg:top-4">
          <SourceExcerpt sourceId={chapter.sourceId} startOffset={chapter.startOffset} endOffset={chapter.endOffset} fileName={source?.fileName} />
        </div>
      </div>

      <SelfCheck items={items} checked={checked} onToggle={toggle} loading={!note && !noteError} juniorName={juniorName} />

      <StudyActionBar
        materialId={materialId}
        run={run}
        runError={runError}
        onRetryRun={reload}
        action={chapter.action}
        busy={starting}
        error={startError}
        ready={ready}
        total={items.length}
        onGo={() => void go()}
      />
    </div>
  );
}
