import type { Metadata } from "next";
import "./globals.css";

// [A 소유] 앱 셸 레이아웃. B 작업 빌드를 위한 최소 버전이며 A가 사이드바/로그인 가드로 교체한다.
export const metadata: Metadata = {
  title: "KUREND",
  description: "가르쳐야 아는 AI 새내기에게 전공을 가르쳐라 — KUREND",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
