"use client";
/**
 * 공부하기 — 이 목차의 자료 원문(GET /sources/{sourceId}/content → startOffset~endOffset).
 * 검색어를 입력하면 일치하는 곳을 <mark> 로 강조하고, ↑/↓(또는 Enter / Shift+Enter)로 결과 사이를 이동한다.
 */
import clsx from "clsx";
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { SourceContentDto } from "@/contracts/types";
import { api } from "@/lib/client/api";
import { Button, Card, Spinner } from "@/components/session/ui";

/** 한 글자 검색 등으로 강조가 폭주하지 않도록 상한을 둔다 */
const MAX_MARKS = 300;

type Segment = { text: string; match: number | null };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 대소문자 무시, 검색어의 공백은 줄바꿈을 포함한 아무 공백과 일치 */
function splitByQuery(text: string, query: string): { segments: Segment[]; count: number; capped: boolean } {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { segments: [{ text, match: null }], count: 0, capped: false };
  const re = new RegExp(tokens.map(escapeRegExp).join("\\s+"), "gi");
  const segments: Segment[] = [];
  let last = 0;
  let count = 0;
  let capped = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (count >= MAX_MARKS) {
      capped = true;
      break;
    }
    if (m.index > last) segments.push({ text: text.slice(last, m.index), match: null });
    segments.push({ text: m[0], match: count });
    count += 1;
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: null });
  return { segments, count, capped };
}

type LineKind = "h1" | "h2" | "quote" | "bullet" | "blank" | "text";

/**
 * 마크다운 원문을 읽기 좋은 줄로 바꾼다 — #·>·- 같은 기호와 **·` 강조 표시를 지우고 줄 종류만 남긴다.
 * 검색은 이렇게 정리된 글자 위에서 이뤄지므로 화면에 보이는 그대로 찾아진다.
 */
function readableSource(raw: string): { text: string; kinds: LineKind[] } {
  const lines: string[] = [];
  const kinds: LineKind[] = [];
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) continue; // 표 구분선
    let body = line;
    let kind: LineKind = "text";
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(body);
    if (heading) { body = heading[2]; kind = heading[1].length <= 2 ? "h1" : "h2"; }
    else if (/^\s*>\s?/.test(body)) { body = body.replace(/^\s*(?:>\s?)+/, ""); kind = "quote"; }
    else if (/^\s*[-*+•]\s+/.test(body)) { body = body.replace(/^\s*(?:[-*+•])\s+/, ""); kind = "bullet"; }
    else if (/^\s*\|.*\|\s*$/.test(body)) body = body.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).join("  ·  ");
    body = body.replace(/\*\*|__|`/g, "").trimEnd();
    if (!body.trim()) kind = "blank";
    if (kind === "blank" && kinds.at(-1) === "blank") continue;
    lines.push(body);
    kinds.push(kind);
  }
  while (kinds.at(-1) === "blank") { kinds.pop(); lines.pop(); }
  return { text: lines.join("\n"), kinds };
}

/** 검색 조각을 줄 단위로 다시 나눈다(여러 줄에 걸친 일치는 같은 data-match 로 이어진다). */
function segmentsByLine(segments: Segment[]): Segment[][] {
  const rows: Segment[][] = [[]];
  for (const segment of segments) {
    const parts = segment.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) rows.push([]);
      if (part) rows[rows.length - 1].push({ text: part, match: segment.match });
    });
  }
  return rows;
}

const LINE_CLASS: Record<LineKind, string> = {
  h1: "mt-5 first:mt-0 text-lg font-bold tracking-tight text-ink",
  h2: "mt-4 first:mt-0 font-bold text-ink",
  quote: "border-l-2 border-primary/40 pl-3 text-muted",
  bullet: "relative pl-4 before:absolute before:left-0 before:text-primary before:content-['•']",
  blank: "h-3",
  text: "",
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function SourceExcerpt({
  sourceId,
  startOffset,
  endOffset,
  fileName,
  className,
}: {
  sourceId: string;
  startOffset: number;
  endOffset: number;
  fileName?: string;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  /** 현재 강조 위치 — 검색어가 바뀌면 처음 결과부터 */
  const [cursor, setCursor] = useState({ query: "", index: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<SourceContentDto>(`/sources/${encodeURIComponent(sourceId)}/content`)
      .then((source) => {
        if (alive) setText(source.text.slice(startOffset, endOffset).trim());
      })
      .catch((failure: unknown) => {
        if (alive) setError(failure instanceof Error ? failure.message : "자료 원문을 불러오지 못했어요.");
      });
    return () => {
      alive = false;
    };
  }, [sourceId, startOffset, endOffset, attempt]);

  const readable = useMemo(() => (text ? readableSource(text) : null), [text]);
  const { segments, count, capped } = useMemo(
    () => (readable ? splitByQuery(readable.text, deferredQuery) : { segments: [] as Segment[], count: 0, capped: false }),
    [readable, deferredQuery],
  );
  const rows = useMemo(() => segmentsByLine(segments), [segments]);
  const searching = deferredQuery.trim().length > 0;
  const activeIndex = count === 0 ? -1 : cursor.query === deferredQuery ? Math.min(cursor.index, count - 1) : 0;

  const move = (delta: number) => {
    if (!count) return;
    setCursor({ query: deferredQuery, index: (activeIndex + delta + count) % count });
  };

  // 현재 결과를 원문 상자 안에서만 가운데로 스크롤(페이지 전체는 움직이지 않음)
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || activeIndex < 0) return;
    const mark = box.querySelector<HTMLElement>(`[data-match="${activeIndex}"]`);
    if (!mark) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = mark.offsetTop - box.clientHeight / 2 + mark.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  }, [activeIndex, segments]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      move(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  };

  const retry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  return (
    <Card className={clsx("overflow-hidden", className)}>
      <div className="border-b border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-bold">자료 원문</h2>
          {(fileName || text) && (
            <p className="min-w-0 max-w-full truncate text-xs text-muted">
              {fileName}
              {fileName && text ? " · " : ""}
              {text ? `${text.length.toLocaleString()}자` : ""}
            </p>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">이 목차가 다루는 원문 범위예요. 헷갈리는 용어를 찾아 보세요.</p>
        <div role="search" className="mt-3 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              disabled={!text}
              aria-label="자료 원문에서 찾기"
              placeholder="원문에서 찾기"
              className="h-10 w-full rounded-sm border border-line bg-bg pl-9 pr-3 text-sm outline-none focus:border-primary focus:bg-surface disabled:opacity-60"
            />
          </div>
          <span aria-live="polite" className={clsx("shrink-0 text-xs tabular-nums", searching && text && count === 0 ? "text-warn" : "text-muted")}>
            {searching && text ? (count ? `${activeIndex + 1}/${count}${capped ? "+" : ""}` : "결과 없음") : ""}
          </span>
          {count > 1 && (
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="secondary" className="w-8 px-0" aria-label="이전 결과" onClick={() => move(-1)}>
                ↑
              </Button>
              <Button size="sm" variant="secondary" className="w-8 px-0" aria-label="다음 결과" onClick={() => move(1)}>
                ↓
              </Button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        role="region"
        aria-label="자료 원문 본문"
        tabIndex={0}
        className="relative max-h-[70vh] overflow-y-auto overscroll-contain px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 sm:px-5 lg:max-h-[min(70vh,calc(100vh_-_17rem))]"
      >
        {text === null ? (
          error ? (
            <div role="alert" className="space-y-3 py-6 text-sm">
              <p className="text-danger">{error}</p>
              <Button size="sm" variant="secondary" onClick={retry}>
                다시 시도
              </Button>
            </div>
          ) : (
            <p role="status" className="flex items-center gap-2 py-10 text-sm text-muted">
              <Spinner /> 자료 원문을 펼치는 중…
            </p>
          )
        ) : text ? (
          <div className="text-[15px] leading-8 text-ink [overflow-wrap:anywhere]">
            {rows.map((row, r) => {
              const kind = readable?.kinds[r] ?? "text";
              return (
                <div key={r} className={clsx("whitespace-pre-wrap", LINE_CLASS[kind])}>
                  {row.map((segment, i) =>
                    segment.match === null ? (
                      <Fragment key={i}>{segment.text}</Fragment>
                    ) : (
                      <mark
                        key={i}
                        data-match={segment.match}
                        className={clsx(
                          "rounded-[3px] px-0.5 text-ink",
                          segment.match === activeIndex ? "bg-accent ring-2 ring-accent/60" : "bg-accent-soft ring-1 ring-accent/50",
                        )}
                      >
                        {segment.text}
                      </mark>
                    ),
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-6 text-sm text-muted">이 목차에 해당하는 원문이 비어 있어요.</p>
        )}
      </div>
    </Card>
  );
}
