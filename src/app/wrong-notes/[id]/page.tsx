import { WrongNoteDetail } from "@/components/wrong-notes/WrongNoteDetail";

export default async function WrongNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WrongNoteDetail id={id} />;
}
