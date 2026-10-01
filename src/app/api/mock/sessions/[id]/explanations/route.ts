import { ExplanationRequestSchema } from "@/contracts/types";
import { readJson, withMock } from "@/mocks/http";
import { buildReactions, coveredObjectives, detectDoubt, extractConcepts, nextQuestion } from "@/mocks/logic";
import { runStream, sleep } from "@/mocks/sse";
import { addMessage, assertExplaining, getSession, packFor } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withMock<{ id: string }>(async (req, { params }) => {
  const s = getSession((await params).id);
  assertExplaining(s);
  const { content } = await readJson(req, ExplanationRequestSchema);
  const pack = packFor(s.chapterId);
  const user = addMessage(s, "USER", "ANSWER", content);
  return runStream(req, async (sse) => {
    sse.send("user.saved", { messageId: user.messageId });
    await sleep(400);
    const doubt = detectDoubt(pack, content, s.juniorLevel);
    if (doubt) {
      await sleep(500);
      const m = addMessage(s, "JUNIOR", "DOUBT", doubt);
      sse.send("junior.doubt", { messageId: m.messageId, content: doubt });
      return;
    }
    const found = extractConcepts(pack, content);
    const added = found.filter((c) => !s.heard.includes(c));
    s.heard = [...s.heard, ...added];
    s.covered = coveredObjectives(pack, s.heard);
    sse.send("junior.concepts", { heardConcepts: s.heard, added });
    await sleep(300);
    const reactions = buildReactions(pack, added, s.juniorLevel);
    for (const r of reactions) {
      if (sse.closed) return;
      sse.send("junior.token", { token: r });
      await sleep(300);
    }
    const rm = addMessage(s, "JUNIOR", "REACTION", reactions.join(" "));
    sse.send("junior.message", { messageId: rm.messageId, stage: "REACTION", content: rm.content });
    await sleep(300);
    const q = nextQuestion(pack, s.covered, s.juniorLevel);
    const qm = addMessage(s, "JUNIOR", "QUESTION", q);
    sse.send("junior.question", { messageId: qm.messageId, content: q, coveredObjectives: s.covered });
  });
});
