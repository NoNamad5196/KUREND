import Link from "next/link";

// [A 소유] 홈 화면 자리. A가 §8-3 홈으로 교체한다. B 세션 화면 확인용 링크만 둔다.
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">KUREND</h1>
      <p className="mt-2 text-muted">가르쳐야 아는 AI 새내기에게 전공을 가르쳐라.</p>
      <div className="mt-8 rounded-card border border-line bg-surface p-5 shadow-card">
        <p className="text-sm text-muted">세션 화면(B) 미리보기 — NEXT_PUBLIC_API_BASE=/api/mock 에서 동작</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>
            <Link className="text-primary underline" href="/session/sess_demo/prepare">
              새 세션 시작 (경제학원론 · 수요의 이해)
            </Link>
          </li>
          <li>
            <Link className="text-primary underline" href="/session/sess_done/complete">
              완료된 세션 보기 (운영체제 · 94점)
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
