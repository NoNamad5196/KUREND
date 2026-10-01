import { CompletePage } from "@/components/exam/pages/CompletePage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompletePage key={id} sessionId={id} />;
}
