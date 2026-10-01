import "@/components/session/session.css";
import { LoginScreen } from "@/components/auth/LoginScreen";

export default function LoginPage() {
  return (
    <>
      <LoginScreen />
      <footer className="pb-6 text-center text-sm text-muted">
        <a className="underline hover:text-ink" href="/privacy.html">개인정보처리방침</a>
      </footer>
    </>
  );
}
