import { ExamPage } from "@/components/exam/pages/ExamPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamPage key={id} sessionId={id} />;
}
