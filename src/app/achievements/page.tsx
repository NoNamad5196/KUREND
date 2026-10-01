import type { Metadata } from "next";
import { AchievementsPage } from "@/components/achievements/AchievementsPage";

export const metadata: Metadata = { title: "업적 · KUREND" };

export default function Page() {
  return <AchievementsPage />;
}
