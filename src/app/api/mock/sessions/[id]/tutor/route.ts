import { TUTOR_PRESET_REQUEST, TutorRequestSchema } from "@/contracts/types";
import { invalidState, readJson, withMock } from "@/mocks/http";
import { tutorResponse } from "@/mocks/logic";
import { runStream, sendChars } from "@/mocks/sse";
import { addTutorMessage, findGap, getSession, packFor } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string }>(async (req, { params }) => {
  const s = getSession((await params).id);
  if (s.status !== "RESULT_READY" && s.status !== "REVIEWING") throw invalidState("채점이 끝난 뒤에 튜터를 쓸 수 있습니다.");
  const { gapId, content } = await readJson(req, TutorRequestSchema);
  const gap = findGap(s, gapId);
  const custom = !!content?.trim();
  const request = custom ? content!.trim() : TUTOR_PRESET_REQUEST;
  const response = tutorResponse(packFor(s.chapterId), gap, custom);
  return runStream(req, async (sse) => {
    await sendChars(sse, response, 25, (ch) => sse.send("tutor.token", { token: ch }));
    if (sse.closed) return;
    const tm = addTutorMessage(s, gapId, request, response);
    sse.send("tutor.message", { id: tm.id, gapId, request, response });
  });
});
