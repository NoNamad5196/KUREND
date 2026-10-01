import type { Metadata } from "next";
import { ProfilePage } from "@/components/profile/ProfilePage";

export const metadata: Metadata = { title: "프로필 · KUREND" };

export default function Page() {
  return <ProfilePage />;
}
