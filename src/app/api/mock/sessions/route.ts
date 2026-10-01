import { CreateSessionRequestSchema } from "@/contracts/types";
import { currentUser } from "@/mocks/auth";
import { ok, readJson, withMock } from "@/mocks/http";
import { createSession, listSessions } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock((req) => ok(listSessions(currentUser(req))));
export const POST = withMock(async (req) => {
  const body = await readJson(req, CreateSessionRequestSchema);
  return ok({ sessionId: createSession(currentUser(req), body.chapterId, body.juniorLevel ?? "EASY") });
});
