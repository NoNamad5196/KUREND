import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveLlm } from "../live";
import { completeJSONWith, LlmFailure } from "../provider";
import { stubLlm } from "../stub";
import { createRouteHandlers } from "../routes/handlers";
import { createStubBackend, D_STUB_IDS } from "../routes/backend-stub";
import { PERSONAS } from "../personas";

test("final exam preparation keeps a bounded budget large enough for ten questions", async () => {
  const { z } = await import("zod");
  for (const [requested, expected] of [[5_300, 5_300], [100_000, 6_000]]) {
    await completeJSONWith(async (_system, _user, options) => {
      assert.equal(options.maxOutputTokens, expected);
      return '{"ok":true}';
    }, "", "", z.object({ ok: z.boolean() }), { stage: "prepare-session", maxOutputTokens: requested });
  }
});

test("selected persona reaches the live response system prompt and payload", async () => {
  for (const character of ["MALE_EASY", "FEMALE_NORMAL"] as const) {
    const calls: Array<{ system: string; body: Record<string, unknown> }> = [];
    const llm = createLiveLlm({
      async completeJSON(system, user, schema) {
        calls.push({ system, body: JSON.parse(user) });
        return schema.parse(calls.length === 1
          ? { concepts: [], contradictions: [], coverage: [], reactionQuote: "" }
          : { reactions: [PERSONAS[character].examples.reaction], question: PERSONAS[character].examples.question });
      },
      async *streamText() { throw new Error("Unexpected text request"); },
    });
    const events = [];
    for await (const event of llm.juniorTurn({ chapter: { title: "수요", points: ["수요"], text: "학습자료" }, level: "EASY", persona: character,
      objectives: [{ id: "o1", text: "수요를 설명한다" }], heardConcepts: [], history: [], explanation: "수요는 구매하려는 양이다." })) events.push(event);
    // 분석 → 반응(두 번째) → 모범답안(반응과 병렬, 실패하면 자료 문장으로 대체)
    assert.equal(calls.length, 3);
    assert.ok(calls[1].system.includes(PERSONAS[character].voice));
    assert.deepEqual(calls[1].body.persona, { id: character, ...PERSONAS[character] });
    assert.deepEqual(calls[1].body.history, [], "fresh conversations carry no previous persona history");
    assert.ok(events.some((event) => event.type === "reaction" && event.content === PERSONAS[character].examples.reaction));
  }
});

test("a failed wording call is not disguised as a successful template", async () => {
  let calls = 0;
  const failure = new LlmFailure("응답을 받을 수 없습니다.");
  const llm = createLiveLlm({
    async completeJSON(_system, _user, schema) {
      calls += 1;
      if (calls === 2) throw failure;
      return schema.parse({ concepts: [], contradictions: [], coverage: [], reactionQuote: "" });
    },
    async *streamText() { throw new Error("Unexpected text request"); },
  });
  await assert.rejects(async () => {
    for await (const event of llm.juniorTurn({ chapter: { title: "주제", points: ["주제"], text: "자료" }, level: "EASY", persona: "FEMALE_NORMAL",
      objectives: [{ id: "o1", text: "주제를 설명한다" }], heardConcepts: [], history: [], explanation: "내 설명" })) {
      assert.equal(event.type, "concepts");
    }
  }, (error: unknown) => error === failure);
  // 반응 호출(2번째)의 실패가 그대로 전달된다. 병렬로 시작된 모범답안 호출(3번째)은 실패를 가리지 않는다.
  assert.equal(calls, 3);
});

test("provider parse failures keep diagnostic reason and stage without private output", async () => {
  const { z } = await import("zod");
  await assert.rejects(completeJSONWith(async () => "PRIVATE_MODEL_OUTPUT", "PRIVATE_PROMPT", "PRIVATE_DOCUMENT", z.object({ ok: z.boolean() }), { stage: "analyze-turn" }), (error: unknown) => {
    assert.ok(error instanceof LlmFailure);
    assert.equal(error.details.reason, "LLM_RESPONSE_PARSE_FAILED");
    assert.equal(error.stage, "analyze-turn");
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE_/);
    return true;
  });
});

test("a failed TOC request persists FAILED and can be retried without losing sources", async () => {
  const backend = createStubBackend();
  const id = D_STUB_IDS.pendingMaterial;
  const request = () => new Request("http://localhost/api/material/generate", { method: "POST", headers: { cookie: `tb_uid=${D_STUB_IDS.user}` } });
  const before = await backend.getMaterial(id, D_STUB_IDS.user);
  const failed = createRouteHandlers({ backend, llm: { ...stubLlm, async generateChapters() { throw new LlmFailure("잠시 후 다시 시도해 주세요."); } } });
  assert.match(await (await failed.generate(request(), id)).text(), /event: error/);
  const after = await backend.getMaterial(id, D_STUB_IDS.user);
  assert.equal(after?.status, "FAILED");
  assert.deepEqual(after?.sources, before?.sources);
  const retried = createRouteHandlers({ backend, llm: stubLlm });
  assert.doesNotMatch(await (await retried.generate(request(), id)).text(), /event: error/);
  assert.equal((await backend.getMaterial(id, D_STUB_IDS.user))?.status, "READY");
});
