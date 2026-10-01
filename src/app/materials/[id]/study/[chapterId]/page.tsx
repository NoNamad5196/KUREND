import type { Metadata } from "next";
import { StudyPage } from "@/components/study/StudyPage";

export const metadata: Metadata = { title: "공부하기 · KUREND" };

/** 공부하기(자료 등록 → 목차 확인 → 공부하기 → 가르치기). 목차를 옮겨 다닐 때 상태가 섞이지 않도록 key 로 새로 마운트한다. */
export default async function Page({ params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const { id, chapterId } = await params;
  return <StudyPage key={`${id}:${chapterId}`} materialId={id} chapterId={chapterId} />;
}
