// [① 게임 코어] 선배용 강의노트
//  GET  /api/materials/{id}/teacher-note           → {chapters:[{chapterId,title,note|null}]}
//  POST /api/materials/{id}/teacher-note {chapterId} → TeacherNoteDto (있으면 캐시, 없으면 ② llm.generateTeacherNote 로 1회 생성)
import { TeacherNoteRequestSchema, TeacherNoteSchema, type TeacherNoteDto, type TeacherNoteListResponse } from "@/contracts/game";
import { llm } from "@/lib/llm";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ApiError, json, notFound, parseJson, withApi } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { parseStringArray } from "@/lib/server/json-fields";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NoteBodySchema = TeacherNoteSchema.omit({ chapterId: true });

function toNote(chapterId: string, noteJson: string): TeacherNoteDto | null {
  try {
    const parsed = NoteBodySchema.safeParse(JSON.parse(noteJson));
    return parsed.success ? { chapterId, ...parsed.data } : null;
  } catch {
    return null;
  }
}

async function ownedMaterial(req: Request, materialId: string) {
  const user = await requireUser(req);
  const material = await db.material.findFirst({ where: { id: materialId, userId: user.userId }, select: { id: true } });
  if (!material) throw notFound("자료를 찾을 수 없습니다.");
  return material;
}

export const GET = withApi<{ id: string }>(async (req, { params }) => {
  const material = await ownedMaterial(req, params.id);
  const chapters = await db.chapter.findMany({
    where: { materialId: material.id },
    orderBy: { order: "asc" },
    select: { id: true, title: true, teacherNote: { select: { noteJson: true } } },
  });
  const body: TeacherNoteListResponse = {
    chapters: chapters.map((c) => ({ chapterId: c.id, title: c.title, note: c.teacherNote ? toNote(c.id, c.teacherNote.noteJson) : null })),
  };
  return json(body);
});

type TeacherNoteGenerator = (input: { chapter: { title: string; points: string[]; text: string } }) => Promise<unknown>;

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const material = await ownedMaterial(req, params.id);
  const { chapterId } = await parseJson(req, TeacherNoteRequestSchema);
  const chapter = await db.chapter.findFirst({
    where: { id: chapterId, materialId: material.id },
    include: { source: { select: { text: true } }, teacherNote: true },
  });
  if (!chapter) throw notFound("목차를 찾을 수 없습니다.");
  if (chapter.teacherNote) {
    const cached = toNote(chapter.id, chapter.teacherNote.noteJson);
    if (cached) return json(cached);
  }

  // ② 가 Llm 에 generateTeacherNote 를 추가하기 전에는 명확한 502 로 알린다.
  const generate = (llm as unknown as { generateTeacherNote?: TeacherNoteGenerator }).generateTeacherNote;
  if (typeof generate !== "function") throw new ApiError("LLM_FAILED", "강의노트 생성 기능이 아직 연결되지 않았습니다.");
  let raw: unknown;
  try {
    raw = await generate.call(llm, {
      chapter: { title: chapter.title, points: parseStringArray(chapter.pointsJson), text: chapter.source.text.slice(chapter.startOffset, chapter.endOffset) },
    });
  } catch (err) {
    console.error("[teacher-note] generate failed", err);
    throw new ApiError("LLM_FAILED", "강의노트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const parsed = NoteBodySchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("LLM_FAILED", "강의노트 형식이 올바르지 않습니다.");

  const note: TeacherNoteDto = { chapterId: chapter.id, ...parsed.data };
  try {
    await db.teacherNote.create({ data: { id: newId("tn"), materialId: material.id, chapterId: chapter.id, noteJson: JSON.stringify(parsed.data) } });
  } catch {
    // 동시 요청이 먼저 저장했으면 저장된 것을 돌려준다(챕터당 1개)
    const saved = await db.teacherNote.findUnique({ where: { chapterId: chapter.id } });
    const cached = saved ? toNote(chapter.id, saved.noteJson) : null;
    if (cached) return json(cached);
  }
  return json(note);
});
