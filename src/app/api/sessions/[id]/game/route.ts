// [① 게임 코어] GET /api/sessions/{id}/game → SessionGameDto (헤더·결과 화면용 단일 호출)
import { FINAL_QUESTION_COUNT, PRACTICE_QUESTION_COUNT, examFormatFor, questionCountFor, passScoreFor, type ExamFormat, type JuniorCharacter, type SessionGameDto } from "@/contracts/game";
import { db } from "@/lib/server/db";
import { json, withApi } from "@/lib/server/http";
import { loadRun, toLifeEventDto, toRunDto } from "@/lib/server/run-dto";
import { loadOwnedSession } from "@/lib/server/session-access";

export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const { session } = await loadOwnedSession(req, params.id);
  const run = session.runId ? await loadRun(db, session.runId) : null;
  const character = run?.character as JuniorCharacter | undefined;
  const [event, mastery] = await Promise.all([
    db.lifeEvent.findUnique({ where: { sessionId: session.id } }),
    run ? db.conceptMastery.findMany({ where: { runId: run.id, chapterId: session.chapterId }, orderBy: { concept: "asc" } }) : [],
  ]);
  const examFormat: ExamFormat = (session.exam?.format as ExamFormat | undefined)
    ?? (session.kind === "FINAL" ? "MIXED" : character ? examFormatFor(character) : "DESCRIPTIVE");
  const body: SessionGameDto = {
    run: run ? toRunDto(run) : null,
    examFormat,
    passScore: character ? passScoreFor(character) : null,
    lifeEvent: event ? toLifeEventDto(event) : null,
    mastery: mastery.map((m) => ({ concept: m.concept, exposureCount: m.exposureCount, mastery: m.mastery })),
    kind: session.kind === "FINAL" ? "FINAL" : "CHAPTER",
    questionCount: session.exam?.questions.length
      || (session.kind === "FINAL" ? FINAL_QUESTION_COUNT : character ? questionCountFor(character) : PRACTICE_QUESTION_COUNT),
  };
  return json(body);
});
