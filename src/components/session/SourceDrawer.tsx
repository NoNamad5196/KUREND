"use client";
/**
 * 챕터 범위만 보여주는 자료 드로어. GET /materials/{id} → chapter 범위 → GET /sources/{sourceId}/content.
 * highlight 가 있으면 <mark> 로 강조하고 그 위치로 스크롤한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MaterialDto, SourceContentDto } from "@/contracts/types";
import { api, ApiError } from "./_api";
import { Button, Drawer, Spinner } from "./ui";

type Loaded = { title: string; text: string };
const cache = new Map<string, Loaded>();

export function SourceDrawer({
  open,
  onClose,
  materialId,
  chapterId,
  highlight,
  title,
}: {
  open: boolean;
  onClose: () => void;
  materialId: string;
  chapterId: string;
  highlight?: string;
  title?: string;
}) {
  const key = `${materialId}:${chapterId}`;
  const [data, setData] = useState<Loaded | null>(cache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const markRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await api.get<MaterialDto>(`/materials/${materialId}`);
      const ch = m.chapters.find((c) => c.chapterId === chapterId);
      if (!ch) throw new ApiError("NOT_FOUND", "목차를 찾을 수 없습니다.", 404);
      const src = await api.get<SourceContentDto>(`/sources/${ch.sourceId}/content`);
      const loaded = { title: ch.title, text: src.text.slice(ch.startOffset, ch.endOffset).trim() };
      cache.set(key, loaded);
      setData(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "자료를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [materialId, chapterId, key]);

  useEffect(() => {
    if (open && !cache.get(key)) void load();
  }, [open, key, load]);

  useEffect(() => {
    if (!open || !data || !highlight) return;
    const t = window.setTimeout(() => markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    return () => window.clearTimeout(t);
  }, [open, data, highlight]);

  let body: React.ReactNode = null;
  if (data) {
    const idx = highlight ? data.text.indexOf(highlight) : -1;
    body =
      idx >= 0 ? (
        <>
          {data.text.slice(0, idx)}
          <mark ref={markRef} className="kurend-mark rounded bg-accent-soft px-0.5 text-ink ring-2 ring-accent/60">
            {highlight}
          </mark>
          {data.text.slice(idx + (highlight?.length ?? 0))}
        </>
      ) : (
        data.text
      );
  }

  return (
    <Drawer open={open} onClose={onClose} title={title ?? `자료 보기${data ? ` · ${data.title}` : ""}`}>
      {loading && !data && (
        <div className="flex items-center gap-2 py-10 text-sm text-muted">
          <Spinner /> 자료를 펼치는 중…
        </div>
      )}
      {error && !data && (
        <div className="space-y-3 py-6 text-sm">
          <p className="text-danger">{error}</p>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            다시 시도
          </Button>
        </div>
      )}
      {data && <div className="whitespace-pre-wrap text-[15px] leading-8 text-ink">{body}</div>}
      <p className="mt-6 border-t border-line pt-3 text-xs text-muted">막힐 때만 잠깐 보세요.</p>
    </Drawer>
  );
}
