import { ReviewPage } from "@/components/exam/pages/ReviewPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewPage key={id} sessionId={id} />;
}
