"use client";

import Link from "next/link";
import { Button } from "@/components/shell/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="mx-auto flex min-h-[55vh] max-w-3xl flex-col justify-center py-12" role="alert">
    <p className="editorial-label text-muted">LET’S TRY AGAIN</p>
    <h1 className="display-title mt-6">화면을 불러오지<br />못했어요<span className="text-primary">.</span></h1>
    <p className="mt-6 max-w-md text-sm leading-7 text-muted">잠시 문제가 생겼어요. 다시 시도하거나 홈에서 공부를 이어가 주세요.</p>
    <div className="mt-8 flex flex-wrap items-center gap-6">
      <Button onClick={reset}>다시 시도</Button>
      <Link href="/" className="text-link">홈으로 돌아가기 <span aria-hidden="true">↗</span></Link>
    </div>
  </section>;
}
