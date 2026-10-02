"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, routeForSession } from "@/lib/client/api";
import type { SessionListItemDto } from "@/contracts/types";
import { Button, Card, Chip, ConfirmDialog, EmptyState, PageHeader } from "@/components/shell/ui";

function relativeDate(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000); if (days <= 0) return "오늘"; if (days === 1) return "어제"; if (days < 7) return `${days}일 전`; return new Date(value).toLocaleDateString("ko-KR"); }
function verdict(value: string | null) { return value === "STABLE" ? "안정" : value === "MOSTLY" ? "대부분 이해" : "보완 필요"; }

export default function SessionsPage() {
  const [items, setItems] = useState<SessionListItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<SessionListItemDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(() => api.get<SessionListItemDto[]>("/sessions").then(setItems).catch((e) => setError(e instanceof Error ? e.message : "세션을 불러오지 못했습니다.")), []);
  useEffect(() => { void load(); }, [load]);
  async function remove() { if (!target) return; setDeleting(true); try { await api.del(`/sessions/${target.sessionId}`); setTarget(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : "세션을 삭제하지 못했습니다."); } finally { setDeleting(false); } }
  const ongoing = items?.filter((item) => item.status !== "COMPLETED" && item.status !== "FAILED") ?? [];
  const completed = items?.filter((item) => item.status === "COMPLETED" || item.status === "FAILED") ?? [];
  function section(title: string, rows: SessionListItemDto[]) { return <section className="session-archive mt-12"><h2 className="mb-5 text-2xl font-bold tracking-tight">{title} <span className="text-primary">{rows.length}</span></h2><Card className="divide-y divide-line border-x-0 border-b-0 bg-transparent p-0">{rows.length ? rows.map((item) => <div key={item.sessionId} className="flex flex-wrap items-center justify-between gap-5 py-6 sm:py-8"><div><Link href={routeForSession(item)} className="text-lg font-semibold tracking-tight hover:text-primary sm:text-2xl">{item.chapterTitle}</Link><p className="mt-1 text-xs text-muted">{item.courseName} · {item.materialTitle} · {relativeDate(item.updatedAt)}</p></div><div className="flex items-center gap-3"><Chip tone={item.finalVerdict === "STABLE" ? "green" : item.finalVerdict ? "yellow" : "neutral"}>{item.finalVerdict ? `${verdict(item.finalVerdict)} · ${item.score ?? "–"}점` : item.stageLabel}</Chip><Link href={routeForSession(item)} className="text-sm font-bold text-primary hover:underline">{item.status === "COMPLETED" ? "보기" : "이어하기"}</Link><button className="min-h-11 min-w-11 p-2 text-xs text-muted hover:bg-danger-soft hover:text-danger" aria-label={`${item.chapterTitle} 세션 삭제`} onClick={() => setTarget(item)}>삭제</button></div></div>) : <p className="p-5 text-sm text-muted">{title} 세션이 없습니다.</p>}</Card></section>; }
  return <><PageHeader title="내 세션" description="가르치던 내용을 이어서 진행하거나 지난 결과를 확인하세요." actions={<Link href="/new"><Button>＋ 새 자료</Button></Link>} />{error && <Card role="alert" className="border-danger text-danger">{error}</Card>}{!items && !error && <p className="py-20 text-center text-muted" role="status">세션을 불러오는 중…</p>}{items && (items.length ? <>{section("진행 중", ongoing)}{section("완료", completed)}</> : <EmptyState title="아직 세션이 없습니다" description="자료를 올리고 가르칠 목차를 골라 보세요." action={<Link href="/new"><Button>새 자료 올리기</Button></Link>} />)}<ConfirmDialog open={!!target} title="세션을 삭제할까요?" description="이 세션의 대화와 결과가 삭제됩니다. 이 작업은 되돌릴 수 없습니다." busy={deleting} onCancel={() => setTarget(null)} onConfirm={remove} /></>;
}
