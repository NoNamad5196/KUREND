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
    let requested = input.sessionId ? await tx.session.findFirst({ where: { id: input.sessionId, runId, userId } }) : null;
    if (requested?.replacementSessionId) requested = await tx.session.findFirst({ where: { id: requested.replacementSessionId, runId, userId } });
    if (input.sessionId && (!requested || requested.status === "COMPLETED" || (input.chapterId && input.chapterId !== requested.chapterId))) {
      throw new ApiError("INVALID_STATE", "현재 학습 범위를 다시 불러와 주세요.", 409, { reason: "CHAT_SESSION_INVALID" });
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
    // A final exam and a focused reteach can share a chapter FK. Their scopes
    // must remain distinct when creating conversations for the next persona.
    type Scope = { chapterId: string; kind: string; focusConceptsJson: string | null };
    const scopeKey = (scope: Scope) => JSON.stringify([scope.chapterId, scope.kind, scope.focusConceptsJson]);
    const selected: Scope | null = requested ?? (input.chapterId
      ? open.find((session) => session.chapterId === input.chapterId && session.kind === "CHAPTER")
        ?? { chapterId: input.chapterId, kind: "CHAPTER", focusConceptsJson: null }
      : null);
    const scopes = new Map<string, Scope>(changed ? open.toReversed().map((session) => [scopeKey(session), session]) : []);
    const selectedKey = selected ? scopeKey(selected) : null;
    if (selected && selectedKey) { scopes.delete(selectedKey); scopes.set(selectedKey, selected); }
    let sessionId: string | null = null;
    for (const [key, scope] of scopes) {
      const previous = open.filter((session) => scopeKey(session) === key);
      let nextId = previous[0]?.id;
      if (changed || !nextId) {
        nextId = newId("sess");
        await tx.session.create({ data: {
          id: nextId, userId, runId, chapterId: scope.chapterId, character: input.character,
          juniorLevel: levelFor(input.character as JuniorCharacter),
          kind: scope.kind,
          focusConceptsJson: scope.focusConceptsJson,
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
      if (key === selectedKey) sessionId = nextId;
    }
    return { run: toRunDto((await loadRun(tx, runId))!), sessionId };
  });
}
