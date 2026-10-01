import "@/components/session/session.css";
import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={<p role="status" className="py-24 text-center text-muted">로그인 화면을 불러오는 중…</p>}>
        <LoginScreen />
      </Suspense>
      <footer className="pb-6 text-center text-sm text-muted">
        <a className="underline hover:text-ink" href="/privacy.html">개인정보처리방침</a>
      </footer>
    </>
  );
}
