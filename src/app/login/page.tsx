import "@/components/session/session.css";
import { LoginScreen } from "@/components/auth/LoginScreen";

// /login — KUREND 로그인 (Google OAuth 는 추후 연결). A 의 앱 셸 머지 시 이 파일은 LoginScreen 을 렌더하는 한 줄로 유지한다.
export default function LoginPage() {
  return <LoginScreen />;
}
