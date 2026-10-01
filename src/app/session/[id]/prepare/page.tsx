import { PreparePage } from "@/components/session/prepare/PreparePage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PreparePage sessionId={id} />;
}
