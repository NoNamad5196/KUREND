import { Toaster } from "@/components/session/ui";
import "@/components/session/session.css";

// [B] 세션 화면 공통 레이아웃: 컨테이너 + 토스트. A의 앱 셸(사이드바)이 머지되면 그 안에 중첩된다.
export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {children}
      <Toaster />
    </div>
  );
}
