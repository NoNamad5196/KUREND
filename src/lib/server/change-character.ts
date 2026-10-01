import { levelFor, type ChangeCharacterRequest, type ChangeCharacterResponse, type JuniorCharacter } from "@/contracts/game";
import { db } from "./db";
import { ApiError, invalidState } from "./http";
import { newId } from "./ids";
import { loadRun, toRunDto } from "./run-dto";

/** A Run owns progress; a Session owns a single character's conversation. */
export async function changeCharacter(userId: string, runId: string, input: ChangeCharacterRequest): Promise<ChangeCharacterResponse> {
  return db.$transaction(async (tx) => {
    const run = await loadRun(tx, runId);
    if (!run || run.userId !== userId) throw new ApiError("NO_RUN", "학습 정보를 불러오지 못했습니다. 자료 화면에서 다시 선택해 주세요.");
    if (run.status !== "ACTIVE") throw invalidState("함께 공부하는 후배만 변경할 수 있습니다.");
    if (input.chapterId && !run.material.chapters.some((chapter) => chapter.id === input.chapterId)) {
      throw new ApiError("NOT_FOUND", "이 자료의 학습 범위를 찾지 못했습니다.", 404, { reason: "CHAT_SESSION_INVALID" });
    }

    const changed = run.character !== input.character;
    if (changed) {
      // Snapshot legacy conversations before updating the shared Run.
      await tx.session.updateMany({ where: { runId, userId, character: null }, data: { character: run.character } });
      const updated = await tx.juniorRun.updateMany({
        where: { id: runId, userId, character: run.character, status: "ACTIVE", updatedAt: run.updatedAt },
        data: { character: input.character },
      });
      if (updated.count !== 1) throw invalidState("후배 선택이 변경되었습니다. 다시 불러와 주세요.");
    }

    const open = await tx.session.findMany({
      where: { runId, userId, replacementSessionId: null, status: { not: "COMPLETED" } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    const chapters = new Set(changed ? open.map((session) => session.chapterId) : []);
    if (input.chapterId) chapters.add(input.chapterId);
    let sessionId: string | null = null;
    for (const chapterId of chapters) {
      const previous = open.filter((session) => session.chapterId === chapterId);
      let nextId = previous[0]?.id;
      if (changed || !nextId) {
        nextId = newId("sess");
        await tx.session.create({ data: {
          id: nextId, userId, runId, chapterId, character: input.character,
          juniorLevel: levelFor(input.character as JuniorCharacter),
          kind: previous[0]?.kind ?? "CHAPTER",
          focusConceptsJson: previous[0]?.focusConceptsJson ?? null,
        } });
        const previousIds = previous.map((session) => session.id);
        if (previousIds.length) {
          // Older bookmarks point directly to the latest conversation, even
          // after multiple character changes. No message or material is deleted.
          await tx.session.updateMany({
            where: { userId, runId, OR: [{ id: { in: previousIds } }, { replacementSessionId: { in: previousIds } }] },
            data: { replacementSessionId: nextId },
          });
        }
      }
      if (chapterId === input.chapterId) sessionId = nextId;
    }
    return { run: toRunDto((await loadRun(tx, runId))!), sessionId };
  });
}
