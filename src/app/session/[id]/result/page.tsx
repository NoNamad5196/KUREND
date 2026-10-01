import { ResultPage } from "@/components/exam/pages/ResultPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultPage key={id} sessionId={id} />;
}
