import type { Metadata } from "next";
import { AchievementsPage } from "@/components/achievements/AchievementsPage";

export const metadata: Metadata = { title: "업적 · 새내기" };

export default function Page() {
  return <AchievementsPage />;
}
