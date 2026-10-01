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
    { messageId: "msg_w_question", role: "JUNIOR", stage: "QUESTION", content: "다음 질문", excluded: false, createdAt: historicalTime,
      teachingChoices: [{ id: "a", text: "자료에서 가져온 설명" }, { id: "b", text: "반대로 가르치는 설명" }] },
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
  assert.deepEqual(reloaded.messages.at(-1)?.teachingChoices, appended.at(-1)?.teachingChoices);
  assert.deepEqual(backend.toSessionDto(reloaded).messages.at(-1)?.teachingChoices, appended.at(-1)?.teachingChoices);
  assert.ok(messages.get("msg_w_question")?.teachingChoicesJson);
  const times = reloaded.messages.map((message) => Date.parse(message.createdAt));
  for (let index = 2; index < times.length; index += 1) assert.ok(times[index] > times[index - 1], "new messages have unambiguous database ordering");
  assert.deepEqual(reloaded.messages.filter((message) => message.role === "USER").map((message) => message.content), ["이전 설명", "이번 설명"]);
});

/* ───────── [① 게임 확장] 실제 SQLite(C 의 db)로 game 스냅샷·choices·Exam.format·mastery 왕복 ───────── */
test("game snapshot, objective choices, exam format and mastery round trip on C's real schema", async (t) => {
  const { existsSync } = await import("node:fs");
  if (!existsSync("prisma/dev.db") && !process.env.DATABASE_URL) {
    t.skip("pnpm db:reset 로 만든 DB 가 없음");
    return;
  }
  const { db } = await import("@/lib/server/db");
  const material = await db.material.findFirst({ where: { userId: "usr_demo1", courseName: "경제학원론" }, include: { chapters: { orderBy: { order: "asc" } } } });
  if (!material) {
    t.skip("시드 데이터 없음 (pnpm db:reset)");
    return;
  }
  const chapterId = material.chapters[0].id;
  const runId = `run_test_${Date.now().toString(36)}`;
  const sessionId = `sess_test_${Date.now().toString(36)}`;
  const practiceId = `${sessionId}_p`;
  await db.juniorRun.create({ data: { id: runId, userId: "usr_demo1", materialId: material.id, character: "MALE_EASY", lives: 2, maxLives: 3 } });
  await db.session.create({ data: { id: sessionId, userId: "usr_demo1", chapterId, runId, status: "PREPARING", juniorLevel: "EASY" } });
  await db.session.create({ data: { id: practiceId, userId: "usr_demo1", chapterId, status: "PREPARING" } });
  try {
    const backend = createPrismaBackend({ db, async requireUser() { return { id: "usr_demo1" }; } });
    const before = await backend.getSession(sessionId, "usr_demo1");
    assert.ok(before);
    const game = (before as typeof before & { game?: { runId: string; character: string; lives: number; passScore: number; examFormat: string; mastery: unknown[] } }).game;
    assert.deepEqual(
      { runId: game?.runId, character: game?.character, lives: game?.lives, passScore: game?.passScore, examFormat: game?.examFormat, mastery: game?.mastery },
      { runId, character: "MALE_EASY", lives: 2, passScore: 60, examFormat: "OBJECTIVE", mastery: [] },
    );
    const practice = await backend.getSession(practiceId, "usr_demo1");
    assert.equal((practice as Record<string, unknown> | null)?.game, undefined, "연습 세션에는 game 이 없다");

    const examId = `exam_test_${Date.now().toString(36)}`;
    const choices = ["가격과 수요량은 같은 방향", "가격과 수요량은 반대 방향", "가격과 공급은 무관", "수요는 항상 일정"];
    const committed = await backend.commitSession(before, {
      ...before,
      status: "EXPLAINING",
      objectives: [{ id: "o1", text: "수요 법칙" }],
      messages: [{ messageId: `${sessionId}_choice`, role: "JUNIOR", stage: "QUESTION", content: "선배님, 무엇을 알려주실 건가요?",
        excluded: false, createdAt: new Date().toISOString(), teachingChoices: [{ id: "c1", text: "수요량이 줄어든다." }, { id: "c2", text: "수요량이 늘어난다." }] }],
      exam: {
        examId, status: "READY", answers: [], grades: [],
        questions: [{ qid: "q1", order: 1, points: 34, question: "수요 법칙은?", objectiveRef: "o1", rubric: "2", choices } as never],
      },
      game: { ...game!, mastery: [{ concept: "수요 법칙", exposureCount: 2, mastery: 140 }] },
    } as never);
    const teachingMessage = await db.message.findUnique({ where: { id: `${sessionId}_choice` } });
    assert.deepEqual(JSON.parse(teachingMessage?.teachingChoicesJson ?? "null"), committed.messages[0].teachingChoices);
    assert.deepEqual(backend.toSessionDto(committed).messages[0].teachingChoices, committed.messages[0].teachingChoices);
    const row = await db.examQuestion.findUnique({ where: { id: `${examId}:q1` } });
    assert.deepEqual(JSON.parse(row?.choicesJson ?? "null"), choices);
    assert.equal((await db.exam.findUnique({ where: { id: examId } }))?.format, "OBJECTIVE");
    assert.deepEqual(committed.exam?.questions[0] && (committed.exam.questions[0] as { choices?: string[] }).choices, choices);
    assert.equal(backend.toSessionDto(committed).exam?.questions[0].choices?.length, 4);
    assert.ok(!JSON.stringify(backend.toSessionDto(committed)).includes("rubric"));
    const mastery = await db.conceptMastery.findMany({ where: { runId } });
    assert.deepEqual(mastery.map((m) => [m.concept, m.exposureCount, m.mastery]), [["수요 법칙", 2, 100]], "숙련도는 0~100 으로 저장");
    const after = await backend.getSession(sessionId, "usr_demo1");
    assert.deepEqual((after as typeof after & { game?: { mastery: unknown[] } })?.game?.mastery, [{ concept: "수요 법칙", exposureCount: 2, mastery: 100 }]);
  } finally {
    await db.session.deleteMany({ where: { id: { in: [sessionId, practiceId] } } });
    await db.juniorRun.deleteMany({ where: { id: runId } });
  }
});

test("reteach session puts focus concepts first in chapter points (prepare builds objectives from points)", async (t) => {
  const { existsSync } = await import("node:fs");
  if (!existsSync("prisma/dev.db") && !process.env.DATABASE_URL) {
    t.skip("pnpm db:reset 로 만든 DB 가 없음");
    return;
  }
  const { db } = await import("@/lib/server/db");
  const material = await db.material.findFirst({ where: { userId: "usr_demo1", courseName: "경제학원론" }, include: { chapters: { orderBy: { order: "asc" } } } });
  if (!material) {
    t.skip("시드 데이터 없음");
    return;
  }
  const chapter = material.chapters[0];
  const original = JSON.parse(chapter.pointsJson) as string[];
  const id = `sess_focus_${Date.now().toString(36)}`;
  await db.session.create({ data: { id, userId: "usr_demo1", chapterId: chapter.id, status: "PREPARING", focusConceptsJson: JSON.stringify(["가격 탄력성"]) } });
  try {
    const backend = createPrismaBackend({ db, async requireUser() { return { id: "usr_demo1" }; } });
    const rec = await backend.getSession(id, "usr_demo1");
    assert.equal(rec?.chapter.points[0], "가격 탄력성");
    assert.equal(rec?.chapter.points.length, Math.max(3, Math.min(1, 4)) > original.length + 1 ? original.length + 1 : 3);
    const plain = await db.session.create({ data: { id: `${id}_p`, userId: "usr_demo1", chapterId: chapter.id, status: "PREPARING" } });
    assert.deepEqual((await backend.getSession(plain.id, "usr_demo1"))?.chapter.points, original, "일반 세션은 원래 포인트 그대로");
  } finally {
    await db.session.deleteMany({ where: { id: { in: [id, `${id}_p`] } } });
  }
});
