import { NextRequest, NextResponse } from "next/server";
import type { ChapterDto, HomeDto, MaterialDto, MaterialListItemDto, SessionListItemDto } from "@/contracts/types";

/** Development-only fixture API for checking A screens before C/D routes are merged. */
export const dynamic = "force-dynamic";

type PreviewSession = SessionListItemDto & { chapterId: string; materialId: string };
type PreviewStore = { materials: Map<string, MaterialDto>; sessions: Map<string, PreviewSession> };
type Context = { params: Promise<{ path: string[] }> };

const accounts = [
  { userId: "usr_demo1", nickname: "체험 1" },
  { userId: "usr_demo2", nickname: "체험 2" },
  { userId: "usr_demo3", nickname: "체험 3" },
];

function seedStore(): PreviewStore {
  const material: MaterialDto = {
    materialId: "mat_preview", title: "프로세스 스케줄링", courseName: "운영체제", examDate: null,
    status: "READY", sources: [{ sourceId: "src_preview", kind: "MD", fileName: "os-sample.md", charCount: 820 }],
    chapters: [
      { chapterId: "chp_preview1", order: 1, title: "프로세스와 상태", points: ["프로세스 상태", "PCB", "문맥 교환"], sourceId: "src_preview", startOffset: 0, endOffset: 400, action: { kind: "START" }, taughtAt: null, stableAt: null, bestScore: null, openGapCount: 0 },
      { chapterId: "chp_preview2", order: 2, title: "CPU 스케줄링", points: ["FCFS", "SJF", "라운드 로빈"], sourceId: "src_preview", startOffset: 400, endOffset: 820, action: { kind: "START" }, taughtAt: null, stableAt: null, bestScore: null, openGapCount: 0 },
    ],
  };
  return { materials: new Map([[material.materialId, material]]), sessions: new Map() };
}

function store(): PreviewStore {
  const globalStore = globalThis as typeof globalThis & { __aPreviewStore?: PreviewStore };
  return globalStore.__aPreviewStore ??= seedStore();
}

function error(status: number, code: string, message: string) { return NextResponse.json({ error: { code, message } }, { status }); }
function unavailable() { return error(404, "NOT_FOUND", "미리보기 API는 개발 모드에서만 사용할 수 있습니다."); }
function isAuthenticated(req: NextRequest) { return accounts.some((account) => account.userId === req.cookies.get("tb_uid")?.value); }
function newId(prefix: string) { return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`; }
function listMaterials(data: PreviewStore): MaterialListItemDto[] {
  return [...data.materials.values()].map((material) => ({
    materialId: material.materialId, title: material.title, courseName: material.courseName, examDate: material.examDate,
    status: material.status, chapterCount: material.chapters.length,
    taughtCount: material.chapters.filter((chapter) => !!chapter.taughtAt).length, createdAt: new Date().toISOString(),
  }));
}
function home(data: PreviewStore, userId: string): HomeDto {
  const groups = new Map<string, HomeDto["courses"][number]>();
  for (const material of data.materials.values()) {
    const course = groups.get(material.courseName) ?? { courseName: material.courseName, examDate: material.examDate, dDay: material.examDate ? Math.ceil((new Date(material.examDate).getTime() - Date.now()) / 86400000) : null, materials: [] };
    const resume = [...data.sessions.values()].find((session) => session.materialId === material.materialId && session.status !== "COMPLETED");
    course.materials.push({ materialId: material.materialId, title: material.title, chapterCount: material.chapters.length, taughtCount: material.chapters.filter((chapter) => !!chapter.taughtAt).length,
      resume: resume ? { sessionId: resume.sessionId, chapterTitle: resume.chapterTitle, status: resume.status, stageLabel: resume.stageLabel } : null });
    groups.set(material.courseName, course);
  }
  const userName = accounts.find((account) => account.userId === userId)?.nickname ?? "체험 1";
  return { userName, courses: [...groups.values()], recentSessions: [...data.sessions.values()].slice(-5).reverse().map((session) => ({ sessionId: session.sessionId, chapterTitle: session.chapterTitle, materialTitle: session.materialTitle, status: session.status, score: session.score, finalVerdict: session.finalVerdict, updatedAt: session.updatedAt })), stats: { completedSessions: 0, averageScore: null, streakDays: 0 } };
}
function generate(material: MaterialDto): Response {
  const chapterCount = Math.max(1, Math.min(3, material.sources.length + 1));
  const chapters: ChapterDto[] = Array.from({ length: chapterCount }, (_, index) => ({
    chapterId: newId("chp"), order: index + 1,
    title: index === 0 ? "핵심 개념" : `${index + 1}번째 주제`,
    points: index === 0 ? ["기본 정의", "중요 용어"] : ["자료의 핵심 내용", "예시와 적용"],
    sourceId: material.sources[Math.min(index, material.sources.length - 1)].sourceId,
    startOffset: index * 100, endOffset: (index + 1) * 100,
    action: { kind: "START" }, taughtAt: null, stableAt: null, bestScore: null, openGapCount: 0,
  }));
  material.title = material.sources[0].fileName.replace(/\.[^.]+$/, "");
  material.chapters = chapters;
  material.status = "READY";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(encoder.encode(": connected\n\n"));
    for (const [step, message] of [["READING", "자료를 읽고 있습니다."], ["SPLITTING", "핵심 내용을 나누고 있습니다."], ["TITLING", "목차 제목을 붙이고 있습니다."]]) {
      controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify({ step, message, elapsedMs: 0 })}\n\n`));
    }
    controller.enqueue(encoder.encode(`event: chapters\ndata: ${JSON.stringify({ title: material.title, chapters: chapters.map(({ chapterId, order, title, points }) => ({ chapterId, order, title, points })) })}\n\n`));
    controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
    controller.close();
  } });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } });
}

async function handle(req: NextRequest, context: Context): Promise<Response> {
  if (process.env.NODE_ENV !== "development") return unavailable();
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (endpoint === "auth/demo-accounts" && req.method === "GET") return NextResponse.json(accounts);
  if (endpoint === "auth/demo-login" && req.method === "POST") {
    const body = await req.json() as { userId?: string };
    if (!accounts.some((account) => account.userId === body.userId)) return error(400, "VALIDATION", "체험 계정을 선택해 주세요.");
    const response = NextResponse.json({ ok: true });
    response.cookies.set("tb_uid", body.userId!, { httpOnly: true, sameSite: "lax", path: "/" });
    return response;
  }
  if (!isAuthenticated(req)) return error(401, "UNAUTHORIZED", "먼저 로그인해 주세요.");
  const data = store();
  if (endpoint === "auth/me" && req.method === "GET") {
    const account = accounts.find((item) => item.userId === req.cookies.get("tb_uid")?.value)!;
    return NextResponse.json({ userId: account.userId, nickname: account.nickname, streakDays: 0 });
  }
  if (endpoint === "auth/logout" && req.method === "POST") {
    const response = NextResponse.json({ ok: true }); response.cookies.delete("tb_uid"); return response;
  }
  if (endpoint === "home" && req.method === "GET") return NextResponse.json(home(data, req.cookies.get("tb_uid")!.value));
  if (endpoint === "materials" && req.method === "GET") return NextResponse.json(listMaterials(data));
  if (endpoint === "materials" && req.method === "POST") {
    const form = await req.formData();
    const courseName = String(form.get("courseName") ?? "").trim();
    const files = form.getAll("files[]").filter((value): value is File => value instanceof File);
    if (!courseName || files.length < 1 || files.length > 5 || files.some((file) => file.size > 10 * 1024 * 1024 || !/\.(md|txt|pdf)$/i.test(file.name))) return error(400, "VALIDATION", "과목명과 md/txt/pdf 파일 1~5개를 확인해 주세요.");
    const materialId = newId("mat");
    const sources: MaterialDto["sources"] = files.map((file) => ({ sourceId: newId("src"), kind: file.name.toLowerCase().endsWith(".pdf") ? "PDF" : file.name.toLowerCase().endsWith(".md") ? "MD" : "TXT", fileName: file.name, charCount: file.size }));
    data.materials.set(materialId, { materialId, title: "새 자료", courseName, examDate: String(form.get("examDate") ?? "") || null, status: "PENDING", sources, chapters: [] });
    return NextResponse.json({ materialId, status: "PENDING", sources });
  }
  if (path[0] === "materials" && path.length >= 2) {
    const material = data.materials.get(path[1]);
    if (!material) return error(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
    if (path.length === 2 && req.method === "GET") return NextResponse.json(material);
    if (path.length === 2 && req.method === "DELETE") { data.materials.delete(path[1]); return NextResponse.json({ ok: true }); }
    if (path[2] === "generate" && req.method === "POST") return generate(material);
  }
  if (endpoint === "sessions" && req.method === "GET") return NextResponse.json([...data.sessions.values()].reverse());
  if (endpoint === "sessions" && req.method === "POST") {
    const body = await req.json() as { chapterId?: string };
    const material = [...data.materials.values()].find((item) => item.chapters.some((chapter) => chapter.chapterId === body.chapterId));
    const chapter = material?.chapters.find((item) => item.chapterId === body.chapterId);
    if (!material || !chapter) return error(404, "NOT_FOUND", "목차를 찾을 수 없습니다.");
    const sessionId = newId("sess");
    data.sessions.set(sessionId, { sessionId, chapterId: chapter.chapterId, materialId: material.materialId, chapterTitle: chapter.title, materialTitle: material.title, courseName: material.courseName, status: "PREPARING", stageLabel: "준비 중", score: null, finalVerdict: null, updatedAt: new Date().toISOString() });
    chapter.action = { kind: "CONTINUE", sessionId, status: "PREPARING" };
    return NextResponse.json({ sessionId });
  }
  if (path[0] === "sessions" && path.length === 2 && req.method === "DELETE") {
    const session = data.sessions.get(path[1]);
    if (!session) return error(404, "NOT_FOUND", "세션을 찾을 수 없습니다.");
    data.sessions.delete(path[1]);
    const chapter = data.materials.get(session.materialId)?.chapters.find((item) => item.chapterId === session.chapterId);
    if (chapter) chapter.action = { kind: "START" };
    return NextResponse.json({ ok: true });
  }
  return error(404, "NOT_FOUND", "미리보기에서 지원하지 않는 요청입니다.");
}

export { handle as GET, handle as POST, handle as DELETE };
