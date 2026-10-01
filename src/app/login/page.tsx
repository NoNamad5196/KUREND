"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import type { DemoAccountDto } from "@/contracts/types";
import { Button, Card } from "@/components/shell/ui";

export default function LoginPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<DemoAccountDto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get<DemoAccountDto[]>("/auth/demo-accounts").then(setAccounts).catch((e) => setError(e instanceof Error ? e.message : "계정을 불러올 수 없습니다.")); }, []);
  async function login(userId: string) {
    setBusy(userId); setError(null);
    try { await api.post("/auth/demo-login", { userId }); router.replace("/"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "로그인에 실패했습니다."); setBusy(null); }
  }
  return <main className="grid min-h-screen place-items-center bg-bg px-4 py-10"><div className="w-full max-w-md"><p className="mb-6 text-center text-2xl font-black text-primary">새내기 <span className="text-xs font-semibold tracking-wide text-muted">KUREND</span></p><Card className="p-8"><div aria-hidden="true" className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-3xl">✦</div><h1 className="text-2xl font-bold">처음 뵙겠습니다, 선배</h1><p className="mt-3 leading-7 text-muted">가르친 만큼만 아는 새내기가 선배의 설명을 기다리고 있습니다.</p><div className="mt-7 space-y-2">{accounts.map((account) => <Button key={account.userId} variant="secondary" className="w-full justify-between" loading={busy === account.userId} disabled={!!busy} onClick={() => login(account.userId)}><span>{account.nickname}로 시작하기</span><span aria-hidden="true">→</span></Button>)}</div>{!accounts.length && !error && <p className="mt-4 text-sm text-muted" role="status">체험 계정을 불러오는 중…</p>}{error && <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">{error}</p>}</Card><p className="mt-5 text-center text-xs text-muted">체험 계정을 선택하면 바로 시작할 수 있습니다.</p></div></main>;
}
