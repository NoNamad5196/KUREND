import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createPrismaBackend } from "../routes/prisma-backend";
import { createRouteHandlers } from "../routes/handlers";
import { createLiveLlm } from "../live";
import { stubLlm } from "../stub";
import { ResultSchema } from "@/contracts/types";
import { WrongNoteSchema } from "@/contracts/game";
import { db } from "@/lib/server/db";
import { requireUser, sessionCookieHeader } from "@/lib/server/auth";
import { sessionInclude, toResultDto } from "@/lib/server/session-dto";
import { ensureWrongNotes, loadOwnedWrongNote, toWrongNoteDto } from "@/lib/server/wrong-note";
import { applyLife } from "@/lib/server/run-life";
import { loadRun, toRunDto } from "@/lib/server/run-dto";
import { POST as finishExplanation } from "@/app/api/sessions/[id]/finish-explanation/route";
import { POST as startExam } from "@/app/api/sessions/[id]/start-exam/route";
import { GET as sessionGame } from "@/app/api/sessions/[id]/game/route";

const wrong = "준비 상태는 입출력 완료를 기다리는 상태야.";
const correct = "준비 상태는 CPU 할당을 기다리는 상태이다.";
const topics = ["준비 상태", "실행 상태", "대기 상태", "종료 상태", "생성 상태"];
const facts = [correct, "실행 상태는 CPU를 사용하여 명령을 실행하는 상태이다.", "대기 상태는 입출력 완료를 기다리는 상태이다.", "종료 상태는 프로세스 실행을 마친 상태이다.", "생성 상태는 프로세스를 생성하는 상태이다."];
const source = facts.join(" ");

async function stream(response: Response) {
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.doesNotMatch(body, /event: error/u, body);
  return body;
}

test("incorrect teaching survives real SQLite, answer generation, result and wrong-note reloads without repeated LIFE", async (t) => {
  if (!process.env.DATABASE_URL) { t.skip("Set DATABASE_URL to an isolated test database"); return; }
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = randomUUID();
  const key = randomUUID().replaceAll("-", "");
  const userId = `usr_${key}`, materialId = `mat_${key}`, sourceId = `src_${key}`, chapterId = `chp_${key}`;
  await db.user.create({ data: { id: userId, nickname: "학습 근거 검증" } });
  try {
    await db.material.create({ data: { id: materialId, userId, title: "프로세스 상태", courseName: "검증", status: "READY" } });
    await db.source.create({ data: { id: sourceId, materialId, kind: "TXT", fileName: "state.txt", text: source, charCount: source.length } });
    await db.chapter.create({ data: { id: chapterId, materialId, sourceId, order: 1, title: "프로세스 상태", pointsJson: JSON.stringify(topics), startOffset: 0, endOffset: source.length } });
    for (const character of ["MALE_EASY", "FEMALE_NORMAL"] as const) {
      const runId = `run_${key}_${character}`, sessionId = `sess_${key}_${character}`;
      await db.juniorRun.create({ data: { id: runId, userId, materialId, character, lives: 3, maxLives: 3 } });
      await db.session.create({ data: { id: sessionId, userId, runId, chapterId, character, juniorLevel: "EASY" } });
      const request = (body?: unknown) => new Request("http://localhost/api/knowledge-persistence", {
        method: "POST", headers: { cookie: sessionCookieHeader(userId).split(";")[0], "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const backend = createPrismaBackend({ db, requireUser });
      let answerCalls = 0;
      const live = createLiveLlm({
        async completeJSON(_system, input, schema) {
          const value = JSON.parse(input);
          // 채점·놓친 곳 진단 호출(answer·rubricElements 가 있음). 답안 작성 호출에도 참고용 chapter 가 들어가므로 chapter 로는 구분하지 않는다.
          if (value.rubricElements || typeof value.answer === "string") {
            const index = Number(value.question.qid.slice(1)) - 1;
            const gap = { title: topics[index], diagnosis: index === 0 ? "학습했던 준비 상태의 의미가 자료와 다릅니다." : "이 개념을 설명에서 다루지 않음.",
              evidenceQuote: index === 0 ? wrong : "", sourceExcerpt: facts[index], concepts: [topics[index]],
              errorReason: index === 0 ? "WRONG_KNOWLEDGE" : "INSUFFICIENT_LEARNING" };
            return schema.parse(value.rubricElements ? { qid: value.question.qid, score: 0, verdict: "WRONG", comment: "자료의 기준을 충족하지 못했습니다.", rubricChecks: [false, false], contradictsSource: index === 0, gap } : { gap });
          }
          answerCalls += 1;
          assert.deepEqual(Object.keys(value).sort(), character === "MALE_EASY" ? ["chapter", "choices", "heardConcepts", "question", "taught", "taughtHints"] : ["chapter", "heardConcepts", "question", "taught", "taughtHints"]);
          assert.equal(value.taught[0].content, wrong);
          const learned = value.question.includes("준비 상태");
          // The model deliberately offers the corrected definition and correct choice.
          // The production grounding boundary must preserve the stored false claim.
          return schema.parse({ thought: "학습 내용을 확인한다.", choice: character === "MALE_EASY" ? "①" : undefined,
            unlearned: !learned, sentences: learned ? [{ quote: wrong, answer: correct, ref: 1, level: "STRONG" }] : [{ quote: null, ref: null, level: "NONE" }] });
        }, async *streamText() { throw new Error("No text provider expected"); },
      });
      const handlers = createRouteHandlers({ backend, llm: { ...stubLlm,
        async prepareSession() {
          return { objectives: topics.map((topic, i) => ({ id: `o${i + 1}`, text: `${topic}를 설명할 수 있다` })), firstQuestion: "준비 상태에 대해 알려주세요.",
            questions: topics.map((topic, i) => ({ qid: `q${i + 1}`, order: i + 1, points: 20, objectiveRef: `o${i + 1}`,
              question: `${topic}의 의미를 설명하시오.`, rubric: character === "MALE_EASY" ? `정답 ①;근거:${facts[i]}` : "상태의 정의;기다리는 대상",
              ...(character === "MALE_EASY" ? { choices: [i, ...topics.map((_, index) => index).filter((index) => index !== i)].slice(0, 4)
                .map((index, order) => `${"①②③④"[order]} ${facts[index].replace(topics[index], topic)}`) } : {}),
            })) };
        }, writeExamAnswer: live.writeExamAnswer, gradeExam: live.gradeExam,
      } });
      await stream(await handlers.prepare(request(), sessionId));
      const taughtStream = await stream(await handlers.explanations(request({ content: wrong }), sessionId));
      assert.match(taughtStream, /event: junior\.question/u);
      assert.doesNotMatch(taughtStream, /event: junior\.doubt|사용자를 믿|설명을 신뢰|자료에는/u);
      const taught = await backend.getSession(sessionId, userId);
      assert.equal(taught?.messages.find((m) => m.role === "USER")?.content, wrong);
      assert.equal(await db.message.count({ where: { sessionId, role: "USER", content: wrong, excluded: false } }), 1);
      const context = { params: Promise.resolve({ id: sessionId }) };
      assert.equal((await finishExplanation(request(), context)).status, 200);
      const started = await startExam(request(), context);
      assert.equal(started.status, 200);
      const publicExam = await started.json();
      assert.equal(publicExam.exam.questions.length, 5);
      assert.ok(!JSON.stringify(publicExam).includes("rubric"));
      for (const q of publicExam.exam.questions) await stream(await handlers.answers(request({ qid: q.qid }), sessionId));
      const cached = await stream(await handlers.answers(request({ qid: "q1" }), sessionId));
      assert.match(cached, /"cached":true/u);
      assert.equal(answerCalls, 5);
      const answer = await db.examAnswer.findFirstOrThrow({ where: { exam: { sessionId }, qid: "q1" } });
      if (character === "MALE_EASY") {
        assert.equal(answer.answer, "3번");
        const sentences = JSON.parse(answer.sentencesJson);
        assert.deepEqual(sentences, [{ sentence: "3번", ref: 1, level: "STRONG", unlearned: false }]);
      } else {
        assert.match(answer.answer, /입출력 완료/u);
        assert.doesNotMatch(answer.answer, /CPU 할당/u);
      }
      await stream(await handlers.evaluate(request(), sessionId));
      assert.equal((await handlers.evaluate(request(), sessionId)).status, 409);
      const reloaded = (await backend.getSession(sessionId, userId))!;
      const gap = reloaded.gaps.find((g) => g.qid === "q1")!;
      assert.equal(gap.errorReason, "WRONG_KNOWLEDGE");
      assert.deepEqual(gap.concepts, ["준비 상태"]);
      assert.equal(gap.evidenceQuote, wrong);
      assert.equal(gap.sourceExcerpt, correct);
      const rawSession = await db.session.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude });
      const result = ResultSchema.parse(toResultDto(rawSession));
      assert.equal(result.gaps.find((g) => g.qid === "q1")?.errorReason, "WRONG_KNOWLEDGE");
      assert.equal(await ensureWrongNotes(userId, sessionId), 5);
      assert.equal(await ensureWrongNotes(userId, sessionId), 0);
      const row = await db.wrongNote.findFirstOrThrow({ where: { sessionId, qid: "q1" } });
      const note = WrongNoteSchema.parse(toWrongNoteDto((await loadOwnedWrongNote(userId, row.id))!));
      assert.equal(note.errorReason, "WRONG_KNOWLEDGE");
      assert.deepEqual(note.missedConcepts, ["준비 상태"]);
      assert.equal(note.evidenceQuote, wrong);
      assert.equal(note.sourceExcerpt, correct);
      const firstLife = await applyLife(userId, runId, sessionId);
      const repeatedLife = await applyLife(userId, runId, sessionId);
      assert.equal(firstLife.applied, true);
      assert.equal(firstLife.livesAfter, 2);
      assert.equal(repeatedLife.applied, false);
      assert.equal(repeatedLife.livesAfter, 2);
      assert.equal(await db.lifeEvent.count({ where: { sessionId } }), 1);
      // Old string-only rows remain readable after the additive metadata change.
      await db.gap.update({ where: { id: gap.gapId }, data: { conceptsJson: JSON.stringify(["준비 상태"]) } });
      const legacy = (await backend.getSession(sessionId, userId))!.gaps.find((g) => g.qid === "q1")!;
      assert.deepEqual(legacy.concepts, ["준비 상태"]);
      assert.equal(legacy.errorReason, undefined);
      if (character === "FEMALE_NORMAL") {
        for (const count of [3, 7, 10]) {
          const legacyId = `${sessionId}_legacy_${count}`, examId = `exam_${key}_${count}`;
          await db.session.create({ data: { id: legacyId, userId, runId, chapterId, character, status: "EXPLAINING", kind: count === 10 ? "FINAL" : "CHAPTER",
            exam: { create: { id: examId, status: "READY", format: count === 10 ? "MIXED" : "DESCRIPTIVE", questions: { create: Array.from({ length: count }, (_, i) => ({
              id: `${examId}:q${i + 1}`, qid: `q${i + 1}`, order: i + 1, points: Math.floor(100 / count) + Number(i < 100 % count),
              question: `기존 문항 ${i + 1}을 설명하시오.`, objectiveRef: `o${i + 1}`, rubric: "기존 기준;기존 근거",
            })) } } },
          } });
          const before = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { questions: true } });
          const resumed = await stream(await handlers.prepare(request(), legacyId));
          assert.match(resumed, /event: ready/u);
          const gameResponse = await sessionGame(request(), { params: Promise.resolve({ id: legacyId }) });
          assert.equal(gameResponse.status, 200);
          assert.equal((await gameResponse.json()).questionCount, count);
          assert.deepEqual(await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { questions: true } }), before, "resuming preserves historical questions and grading criteria");
          if (count === 10) assert.equal(toRunDto((await loadRun(db, runId))!).finalExam.questionCount, 10);
        }
      }
    }
  } finally {
    await db.material.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});
