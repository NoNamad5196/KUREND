import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultStubSeed, D_STUB_IDS as ids } from "../routes/backend-stub";
import { createPrismaBackend, type PrismaSessionAggregate } from "../routes/prisma-backend";
import type { MessageRecord } from "../routes/backend";

test("Prisma adapter round trip preserves turn order when appended messages share one timestamp", async () => {
  const seed = createDefaultStubSeed();
  const initial = seed.sessions.find((session) => session.sessionId === ids.prepareSession)!;
  const material = seed.materials.find((item) => item.materialId === initial.material.materialId)!;
  const sources = material.sources.map(({ sourceId, ...source }) => ({ id: sourceId, ...source }));
  const chapters = material.chapters.map(({ chapterId, points, ...chapter }) => ({ id: chapterId, pointsJson: JSON.stringify(points), ...chapter }));
  const historicalTime = "2026-10-01T00:00:01.000Z";
  const raw: PrismaSessionAggregate = {
    id: initial.sessionId, userId: initial.userId, status: "EXPLAINING", phase: "QUESTION", juniorLevel: "EASY",
    objectivesJson: "[]", heardJson: "[]", score: null, finalVerdict: null, error: null,
    createdAt: initial.createdAt, updatedAt: initial.updatedAt,
    chapter: {
      ...chapters[0], source: sources[0], material: {
        id: material.materialId, userId: material.userId, title: material.title,
        courseName: material.courseName, status: material.status, error: null, sources, chapters,
      },
    },
    messages: [
      { id: "msg_old_user", role: "USER", stage: "ANSWER", content: "이전 설명", excluded: false, createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "msg_old_question", role: "JUNIOR", stage: "QUESTION", content: "다음 질문", excluded: false, createdAt: historicalTime },
    ],
    exam: null, gaps: [],
  };

  // This fake implements only relational reads/upserts and the requested sort;
  // timestamp assignment belongs entirely to the production adapter under test.
  const messages = new Map(raw.messages.map((message) => [message.id, structuredClone(message)]));
  type Args = Record<string, unknown>;
  const tx = {
    material: {},
    session: {
      async findFirst(args: Args) {
        const where = args.where as { id: string; userId: string };
        if (where.id !== raw.id || where.userId !== raw.userId) return null;
        const include = args.include as { messages: { orderBy: unknown } };
        assert.deepEqual(include.messages.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
        const sorted = [...messages.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
        return structuredClone({ ...raw, messages: sorted });
      },
      async updateMany(args: Args) {
        const where = args.where as { updatedAt: Date };
        if (where.updatedAt.getTime() !== new Date(raw.updatedAt).getTime()) return { count: 0 };
        Object.assign(raw, args.data);
        return { count: 1 };
      },
    },
    message: {
      async upsert(args: Args) {
        const where = args.where as { id: string };
        const previous = messages.get(where.id);
        const data = (previous ? args.update : args.create) as Partial<PrismaSessionAggregate["messages"][number]>;
        messages.set(where.id, { ...previous, ...data, id: where.id } as PrismaSessionAggregate["messages"][number]);
      },
    },
  };
  const db = { ...tx, async $transaction<T>(work: (transaction: typeof tx) => Promise<T>) { return work(tx); } };
  const backend = createPrismaBackend({ db, async requireUser() { return { id: ids.user }; } });
  const previous = await backend.getSession(initial.sessionId, ids.user);
  assert.ok(previous);
  const appended: MessageRecord[] = [
    { messageId: "msg_z_user", role: "USER", stage: "ANSWER", content: "이번 설명", excluded: false, createdAt: historicalTime },
    { messageId: "msg_y_reaction", role: "JUNIOR", stage: "REACTION", content: "첫 반응", excluded: false, createdAt: historicalTime },
    { messageId: "msg_x_reaction", role: "JUNIOR", stage: "REACTION", content: "두 번째 반응", excluded: false, createdAt: historicalTime },
    { messageId: "msg_w_question", role: "JUNIOR", stage: "QUESTION", content: "다음 질문", excluded: false, createdAt: historicalTime },
  ];
  const committed = await backend.commitSession(previous, {
    ...previous,
    messages: [...previous.messages.map((message) => ({ ...message, createdAt: "2027-01-01T00:00:00.000Z" })), ...appended],
  });
  const reloaded = await backend.getSession(initial.sessionId, ids.user);
  assert.ok(reloaded);
  const expectedIds = [...previous.messages, ...appended].map((message) => message.messageId);
  assert.deepEqual(committed.messages.map((message) => message.messageId), expectedIds);
  assert.deepEqual(reloaded.messages.map((message) => message.messageId), expectedIds);
  assert.deepEqual(reloaded.messages.slice(0, 2), previous.messages, "historical timestamps are never rewritten");
  const times = reloaded.messages.map((message) => Date.parse(message.createdAt));
  for (let index = 2; index < times.length; index += 1) assert.ok(times[index] > times[index - 1], "new messages have unambiguous database ordering");
  assert.deepEqual(reloaded.messages.filter((message) => message.role === "USER").map((message) => message.content), ["이전 설명", "이번 설명"]);
});
