import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { changeCharacter } from "../change-character";
import { db } from "../db";
import { ApiError } from "../http";
import { findOwnedSession } from "../session-access";
import { applyLife } from "../run-life";
import { materialInclude, toMaterialDto } from "../material-dto";
import { createPrismaBackend } from "@/lib/llm/routes/prisma-backend";

test("character changes preserve study data and replace only conversations, including old bookmarks", async (t) => {
  if (!process.env.DATABASE_URL) { t.skip("Set DATABASE_URL to an isolated test database"); return; }
  const key = randomUUID().replaceAll("-", "");
  const userId = `usr_${key}`, materialId = `mat_${key}`, chapterId = `chp_${key}`, sourceId = `src_${key}`;
  const runId = `run_${key}`, sessionId = `sess_${key}`;
  await db.user.create({ data: { id: userId, nickname: "character regression" } });
  try {
    await db.material.create({ data: { id: materialId, userId, title: "보존할 자료", courseName: "경제학", status: "READY" } });
    await db.source.create({ data: { id: sourceId, materialId, kind: "TXT", fileName: "test.txt", text: "수요와 공급", charCount: 6 } });
    await db.chapter.create({ data: { id: chapterId, materialId, sourceId, order: 1, title: "수요", pointsJson: '["수요"]', startOffset: 0, endOffset: 6 } });
    await db.juniorRun.create({ data: { id: runId, userId, materialId, character: "MALE_EASY", lives: 2 } });
    await db.chapterProgress.create({ data: { runId, chapterId, attempts: 2, bestScore: 90, cleared: true } });
    await db.conceptMastery.create({ data: { runId, chapterId, concept: "수요", exposureCount: 3, mastery: 70 } });
    await db.session.create({ data: { id: sessionId, userId, runId, chapterId, status: "EXPLAINING", focusConceptsJson: '["수요"]', messages: {
      create: { id: `msg_${key}`, role: "USER", stage: "ANSWER", content: "컴돌이에게 설명한 내용" },
    } } });
    await db.session.create({ data: { id: `${sessionId}_final`, userId, runId, chapterId, kind: "FINAL" } });
    await db.wrongNote.create({ data: { id: `wn_${key}`, userId, runId, sessionId, qid: "q1", userReason: "연습", aiDiagnosis: "이유 보완" } });
    const preserved = async () => ({
      material: await db.material.findUnique({ where: { id: materialId }, include: { sources: true, chapters: true } }),
      progress: await db.chapterProgress.findMany({ where: { runId } }),
      mastery: await db.conceptMastery.findMany({ where: { runId } }),
      wrongNotes: await db.wrongNote.findMany({ where: { runId } }),
    });
    const before = await preserved();
    const backend = createPrismaBackend({ db, async requireUser() { return { id: userId }; } });
    const old = (await backend.getSession(sessionId, userId))!;
    assert.equal(old.game?.character, "MALE_EASY");
    assert.equal(old.game?.examFormat, "OBJECTIVE");

    await assert.rejects(changeCharacter("usr_other", runId, { character: "FEMALE_NORMAL", chapterId }), (e: unknown) => e instanceof ApiError && e.status === 404);
    await assert.rejects(changeCharacter(userId, runId, { character: "FEMALE_NORMAL", chapterId: "chp_other" }));
    assert.equal((await db.juniorRun.findUniqueOrThrow({ where: { id: runId } })).character, "MALE_EASY");

    const female = await changeCharacter(userId, runId, { character: "FEMALE_NORMAL", chapterId });
    assert.ok(female.sessionId && female.sessionId !== sessionId);
    assert.equal(female.run.character, "FEMALE_NORMAL");
    assert.equal(female.run.materialId, materialId);
    assert.equal(female.run.lives, 2);
    assert.equal(female.run.examFormat, "DESCRIPTIVE");
    assert.deepEqual(await preserved(), before);
    const next = await db.session.findUniqueOrThrow({ where: { id: female.sessionId }, include: { messages: true, exam: true } });
    assert.equal(next.runId, runId);
    assert.equal(next.chapterId, chapterId);
    assert.equal(next.character, "FEMALE_NORMAL");
    assert.equal(next.focusConceptsJson, '["수요"]');
    assert.deepEqual(next.messages, []);
    assert.equal(next.exam, null);
    assert.equal((await backend.getSession(next.id, userId))?.game?.character, "FEMALE_NORMAL");
    const final = await db.session.findFirstOrThrow({ where: { runId, kind: "FINAL", replacementSessionId: null } });
    assert.notEqual(final.id, next.id, "chapter and final scope must not merge");
    assert.equal(female.run.finalExam.sessionId, final.id);
    const finalSnapshot = (await backend.getSession(final.id, userId))!;
    assert.equal(finalSnapshot.game?.kind, "FINAL");
    assert.equal(finalSnapshot.game?.examFormat, "MIXED");
    assert.equal(finalSnapshot.game?.questionCount, 5);
    assert.match(finalSnapshot.chapter.title, /졸업시험/);
    await assert.rejects(backend.commitSession(old, old), (e: unknown) => (e as { details?: { replacementSessionId?: string } }).details?.replacementSessionId === next.id);
    await assert.rejects(findOwnedSession(userId, sessionId), (e: unknown) => e instanceof ApiError && e.details.replacementSessionId === next.id);
    await assert.rejects(applyLife(userId, runId, sessionId), (e: unknown) => e instanceof ApiError && e.details.replacementSessionId === next.id);
    const repeated = await changeCharacter(userId, runId, { character: "FEMALE_NORMAL", chapterId });
    assert.equal(repeated.sessionId, next.id, "repeated selection does not duplicate a conversation");

    const third = await changeCharacter(userId, runId, { character: "KU_HARD", chapterId });
    assert.ok(third.sessionId);
    const historical = await db.session.findUniqueOrThrow({ where: { id: sessionId }, include: { messages: true } });
    assert.equal(historical.character, "MALE_EASY");
    assert.equal(historical.messages[0].content, "컴돌이에게 설명한 내용");
    assert.equal(historical.replacementSessionId, third.sessionId, "old bookmarks resolve directly after multiple switches");
    const material = toMaterialDto(await db.material.findUniqueOrThrow({ where: { id: materialId }, include: materialInclude }));
    assert.deepEqual(material.chapters[0].action, { kind: "CONTINUE", sessionId: third.sessionId, status: "PREPARING" });
    assert.deepEqual(await preserved(), before);
    const activeFinal = await db.session.findFirstOrThrow({ where: { runId, kind: "FINAL", replacementSessionId: null } });
    const switchedFinal = await changeCharacter(userId, runId, { character: "FEMALE_NORMAL", chapterId, sessionId: activeFinal.id });
    assert.ok(switchedFinal.sessionId);
    assert.equal((await db.session.findUniqueOrThrow({ where: { id: switchedFinal.sessionId } })).kind, "FINAL");
    assert.equal(switchedFinal.run.finalExam.sessionId, switchedFinal.sessionId);
    const chapterAction = toMaterialDto(await db.material.findUniqueOrThrow({ where: { id: materialId }, include: materialInclude })).chapters[0].action;
    assert.equal(chapterAction.kind, "CONTINUE");
    if (chapterAction.kind === "CONTINUE") assert.notEqual(chapterAction.sessionId, switchedFinal.sessionId);
    assert.deepEqual(await preserved(), before);
  } finally {
    await db.material.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  }
});
