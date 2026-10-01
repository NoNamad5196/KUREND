import { runRoute } from "@/lib/llm/routes/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return runRoute("evaluate", request, id);
}
