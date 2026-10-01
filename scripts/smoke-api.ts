/**
 * [C] §5-2 ~ §5-5 API 스모크 테스트. 응답을 src/contracts/types.ts 의 zod 스키마로 검증한다.
 *
 *   pnpm db:reset && pnpm dev            # 다른 터미널
 *   pnpm tsx scripts/smoke-api.ts        # 기본 http://localhost:3000/api  (SMOKE_BASE 로 변경)
 *
 * D 의 LLM 라우트가 없어도 돌아가도록, EXPLAINING 이후 상태는 DB 를 직접 조작해 만든다.
 * 끝나면 테스트가 만든 데이터는 지우고 시드 상태로 되돌린다.
 */
import {
  CompleteResponseSchema,
  CreateSessionResponseSchema,
  DemoAccountSchema,
  FinishExplanationResponseSchema,
  HomeSchema,
  MaterialCreateResponseSchema,
  MaterialListItemSchema,
  MaterialSchema,
  MeSchema,
  OkResponseSchema,
  ResultSchema,
  ReviewedResponseSchema,
  SessionListItemSchema,
  SessionSchema,
  SourceContentSchema,
  StartExamResponseSchema,
} from "@/contracts/types";
import { z } from "zod";
import {
  ApplyLifeResponseSchema,
  CurrentRunResponseSchema,
  AlbumResponseSchema,
  GraduateResponseSchema,
  ReteachResponseSchema,
  WrongNoteListResponseSchema,
  WrongNoteSchema,
  TeacherNoteListResponseSchema,
  RunSchema,
  SessionGameSchema,
  StartFinalResponseSchema,
  type RunDto,
} from "@/contracts/game";
import { db } from "@/lib/server/db";
import { examItemId, newId } from "@/lib/server/ids";

const BASE = (process.env.SMOKE_BASE ?? "http://localhost:3000/api").replace(/\/$/, "");
let cookie = "";
let passed = 0;
let failed = 0;

function ok(name: string, cond: unknown, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✘ ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 600));
  }
}

async function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { ...(cookie ? { cookie } : {}) };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

function expectError(name: string, r: { status: number; data: unknown }, status: number, code: string) {
  const d = r.data as { error?: { code?: string } } | null;
  ok(`${name} → ${status} ${code}`, r.status === status && d?.error?.code === code, { status: r.status, data: d });
}

function validate<T>(name: string, schema: z.ZodType<T>, data: unknown): T | null {
  const p = schema.safeParse(data);
  ok(`${name} 스키마`, p.success, p.success ? undefined : { issues: p.error.issues.slice(0, 5), data });
  return p.success ? p.data : null;
}

/** 손으로 만든 최소 PDF (Helvetica 텍스트 한 줄, ASCII 만) */
function makePdf(text: string): Blob {
  const enc = new TextEncoder();
  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>";
  const stream = `BT /F1 18 Tf 72 700 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  objs[4] = `<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`;
  objs[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let out = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = enc.encode(out).length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = enc.encode(out).length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: "application/pdf" });
}

async function main() {
  console.log(`smoke: ${BASE}`);

  /* ── 인증 ── */
  console.log("\n[auth]");
  const accounts = await call("GET", "/auth/demo-accounts");
  ok("GET /auth/demo-accounts 200", accounts.status === 200, accounts);
  const accs = validate("demo-accounts", z.array(DemoAccountSchema), accounts.data);
  ok("데모 계정 3개", accs?.length === 3, accs);

  expectError("GET /auth/me (로그인 전)", await call("GET", "/auth/me"), 401, "UNAUTHORIZED");
  expectError("POST /auth/demo-login 없는 계정", await call("POST", "/auth/demo-login", { userId: "usr_nope" }), 404, "NOT_FOUND");
  expectError("POST /auth/demo-login 잘못된 본문", await call("POST", "/auth/demo-login", { nope: 1 }), 400, "VALIDATION");

  const login = await call("POST", "/auth/demo-login", { userId: "usr_demo1" });
  ok("POST /auth/demo-login 200", login.status === 200, login);
  validate("demo-login", OkResponseSchema, login.data);
  const setCookie = login.headers.get("set-cookie") ?? "";
  ok("Set-Cookie tb_uid HttpOnly", /tb_uid=usr_demo1/.test(setCookie) && /HttpOnly/i.test(setCookie), setCookie);
  cookie = setCookie.split(";")[0];

  // [게임 확장] 아래 기존 체크는 Run 없는 "연습 모드" 기준이다. 체험1 의 ACTIVE Run 을 잠시 멈추고 [game] 직전에 되돌린다.
  // 이전 실행이 중간에 끊겨 멈춘 채 남은 Run(진짜 GAME OVER 와 달리 endedAt 이 없음)을 먼저 되살린다.
  await db.juniorRun.updateMany({ where: { userId: "usr_demo1", status: "GAME_OVER", endedAt: null }, data: { status: "ACTIVE" } });
  const pausedRuns = await db.juniorRun.findMany({ where: { userId: "usr_demo1", status: "ACTIVE" }, select: { id: true } });
  await db.juniorRun.updateMany({ where: { id: { in: pausedRuns.map((r) => r.id) } }, data: { status: "GAME_OVER" } });
  const pausedSessions = await db.session.findMany({
    where: { runId: { in: pausedRuns.map((r) => r.id) }, status: { not: "COMPLETED" } },
    select: { id: true, runId: true, character: true },
  });
  const pausedHome = HomeSchema.parse((await call("GET", "/home")).data);
  ok("종료된 Run의 세션은 홈 이어하기에 섞이지 않음", pausedHome.courses.every((course) => course.materials.every((material) => !pausedSessions.some((session) => session.id === material.resume?.sessionId))));
  // 실제 연습 세션에는 Run과 캐릭터 스냅샷이 모두 없다. 시드의 진행 중
  // 대화를 잠시 이 상태로 바꿔 아래 연습 모드 검증을 수행하고 되돌린다.
  await db.session.updateMany({ where: { id: { in: pausedSessions.map((session) => session.id) } }, data: { runId: null, character: null } });

  const me = await call("GET", "/auth/me");
  const meDto = validate("GET /auth/me", MeSchema, me.data);
  ok("me.userId = usr_demo1", meDto?.userId === "usr_demo1" && meDto.nickname === "체험 1", meDto);

  /* ── 홈 ── */
  console.log("\n[home]");
  const home = await call("GET", "/home");
  const homeDto = validate("GET /home", HomeSchema, home.data);
  ok("홈 과목 2개 (운영체제, 경제학원론)", homeDto?.courses.length === 2, homeDto?.courses.map((c) => c.courseName));
  const os = homeDto?.courses.find((c) => c.courseName === "운영체제");
  ok("운영체제 D-day 7", os?.dDay === 7 && os.examDate !== null, os);
  ok("운영체제 자료 resume(EXPLAINING) 존재", os?.materials[0]?.resume?.status === "EXPLAINING" && os.materials[0].resume.stageLabel === "가르치는 중", os?.materials[0]);
  ok("taughtCount 4(시드: 완료 세션 1 + Run 통과 3) / chapterCount 6", os?.materials[0]?.taughtCount === 4 && os.materials[0].chapterCount === 6, os?.materials[0]);
  ok("최근 세션 2개, 완료 1개 94점, 연속 1일", homeDto?.recentSessions.length === 2 && homeDto.stats.completedSessions === 1 && homeDto.stats.averageScore === 94 && homeDto.stats.streakDays === 1, homeDto?.stats);

  /* ── 자료 ── */
  console.log("\n[materials]");
  const list = await call("GET", "/materials");
  const listDto = validate("GET /materials", z.array(MaterialListItemSchema), list.data);
  ok("자료 2개 READY", listDto?.length === 2 && listDto.every((m) => m.status === "READY"), listDto);
  const osMat = listDto?.find((m) => m.courseName === "운영체제");
  const econMat = listDto?.find((m) => m.courseName === "경제학원론");

  const detail = await call("GET", `/materials/${osMat?.materialId}`);
  const detailDto = validate("GET /materials/{id}", MaterialSchema, detail.data);
  ok("챕터 6개, 순서 1..6", detailDto?.chapters.map((c) => c.order).join() === "1,2,3,4,5,6", detailDto?.chapters.map((c) => c.order));
  ok("챕터 오프셋이 연속·단조 증가", !!detailDto && detailDto.chapters.every((c, i, a) => c.startOffset < c.endOffset && (i === 0 || a[i - 1].endOffset <= c.startOffset)), detailDto?.chapters.map((c) => [c.startOffset, c.endOffset]));
  const retry = detailDto?.chapters.find((c) => c.action.kind === "RETRY");
  const cont = detailDto?.chapters.find((c) => c.action.kind === "CONTINUE");
  ok("완료 챕터 action RETRY + bestScore 94 + taughtAt + openGapCount 1", retry?.bestScore === 94 && !!retry.taughtAt && retry.openGapCount === 1 && retry.stableAt === null, retry);
  ok("진행 중 챕터 action CONTINUE(EXPLAINING)", cont?.action.kind === "CONTINUE" && cont.action.status === "EXPLAINING", cont?.action);
  ok("rubric 미노출", !JSON.stringify(detail.data).includes("rubric"));
  expectError("GET /materials/없는id", await call("GET", "/materials/mat_nope"), 404, "NOT_FOUND");

  const src = await call("GET", `/sources/${detailDto?.sources[0]?.sourceId}/content`);
  const srcDto = validate("GET /sources/{id}/content", SourceContentSchema, src.data);
  ok("원문 길이 = charCount", srcDto?.text.length === detailDto?.sources[0]?.charCount, { len: srcDto?.text.length, charCount: detailDto?.sources[0]?.charCount });
  ok("챕터 범위 slice 길이 > 300", !!srcDto && !!detailDto && srcDto.text.slice(detailDto.chapters[2].startOffset, detailDto.chapters[2].endOffset).length > 300);

  /* ── 세션 목록/조회 ── */
  console.log("\n[sessions: 조회]");
  const sess = await call("GET", "/sessions");
  const sessList = validate("GET /sessions", z.array(SessionListItemSchema), sess.data);
  ok("세션 2개, 최신(EXPLAINING) 먼저", sessList?.length === 2 && sessList[0].status === "EXPLAINING" && sessList[0].stageLabel === "가르치는 중", sessList);
  const completedId = sessList?.find((s) => s.status === "COMPLETED")?.sessionId;
  const explainingId = sessList?.find((s) => s.status === "EXPLAINING")?.sessionId;

  const s1 = await call("GET", `/sessions/${explainingId}`);
  const s1Dto = validate("GET /sessions/{id} (EXPLAINING)", SessionSchema, s1.data);
  ok("objectives 3 / exam READY, questions 3, answers 0 / messages 4", s1Dto?.objectives.length === 3 && s1Dto.exam?.status === "READY" && s1Dto.exam.questions.length === 3 && s1Dto.exam.answers.length === 0 && s1Dto.messages.length === 4, s1Dto);
  ok("rubric 미노출(세션)", !JSON.stringify(s1.data).includes("rubric"));
  ok("메시지 시간순", !!s1Dto && s1Dto.messages.every((m, i, a) => i === 0 || a[i - 1].createdAt <= m.createdAt));

  const s2 = await call("GET", `/sessions/${completedId}`);
  const s2Dto = validate("GET /sessions/{id} (COMPLETED)", SessionSchema, s2.data);
  ok("완료 세션 score 94 MOSTLY gapCount 1 exam GRADED answers 3", s2Dto?.score === 94 && s2Dto.finalVerdict === "MOSTLY" && s2Dto.gapCount === 1 && s2Dto.exam?.status === "GRADED" && s2Dto.exam.answers.length === 3, s2Dto);

  const r2 = await call("GET", `/sessions/${completedId}/result`);
  const r2Dto = validate("GET /sessions/{id}/result", ResultSchema, r2.data);
  ok("result 합계 94 = Σgrade, correct2/partial1/wrong0, gap 1 + tutorMessage", r2Dto?.totalScore === 94 && r2Dto.items.reduce((a, i) => a + i.grade.score, 0) === 94 && r2Dto.correctCount === 2 && r2Dto.partialCount === 1 && r2Dto.wrongCount === 0 && r2Dto.gaps.length === 1 && r2Dto.gaps[0].tutorMessages.length >= 1, r2Dto);
  ok("result items 마다 sentences 있음", !!r2Dto && r2Dto.items.every((i) => i.sentences.length > 0), r2Dto?.items.map((i) => i.sentences.length));
  expectError("GET result (EXPLAINING 세션)", await call("GET", `/sessions/${explainingId}/result`), 409, "INVALID_STATE");
  expectError("GET /sessions/없는id", await call("GET", "/sessions/sess_nope"), 404, "NOT_FOUND");

  /* ── 다른 사용자 소유 검증 ── */
  console.log("\n[ownership]");
  const saved = cookie;
  const login2 = await call("POST", "/auth/demo-login", { userId: "usr_demo2" });
  cookie = (login2.headers.get("set-cookie") ?? "").split(";")[0];
  expectError("usr_demo2 → demo1 세션 조회", await call("GET", `/sessions/${explainingId}`), 404, "NOT_FOUND");
  expectError("usr_demo2 → demo1 자료 조회", await call("GET", `/materials/${osMat?.materialId}`), 404, "NOT_FOUND");
  expectError("usr_demo2 → demo1 원문 조회", await call("GET", `/sources/${detailDto?.sources[0]?.sourceId}/content`), 404, "NOT_FOUND");
  expectError("usr_demo2 → demo1 챕터로 세션 생성", await call("POST", "/sessions", { chapterId: detailDto?.chapters[0].chapterId }), 404, "NOT_FOUND");
  expectError("usr_demo2 → demo1 세션 삭제", await call("DELETE", `/sessions/${explainingId}`), 404, "NOT_FOUND");
  const home2 = validate("usr_demo2 홈", HomeSchema, (await call("GET", "/home")).data);
  // [게임 확장] 체험2 는 자기 경제학원론 자료(KU Run 데모용)만 갖고, 체험1 의 자료·세션은 보이지 않는다.
  ok("usr_demo2 홈: 자기 자료 1개(경제학원론)만, 세션 없음", home2?.courses.length === 1 && home2.courses[0].courseName === "경제학원론" && home2.courses[0].materials.every((m) => m.materialId !== econMat?.materialId && m.materialId !== osMat?.materialId) && home2.recentSessions.length === 0 && home2.stats.averageScore === null, home2);
  cookie = saved;

  /* ── 업로드 ── */
  console.log("\n[upload]");
  const fd = new FormData();
  fd.set("courseName", "자료구조");
  fd.set("examDate", "2026-12-20");
  fd.append("files[]", new File(["# 스택과 큐\n\n스택은 LIFO 구조다. push 와 pop 으로 삽입·삭제한다.\n\n큐는 FIFO 구조다. enqueue 와 dequeue 를 쓴다."], "ds-ch1.md", { type: "text/markdown" }));
  fd.append("files[]", new File(["연결 리스트는 노드가 포인터로 이어진 선형 자료구조다. 삽입과 삭제가 O(1) 이다."], "ds-ch2.txt", { type: "text/plain" }));
  fd.append("files[]", new File([makePdf("KUREND smoke test PDF about binary search trees and heaps")], "ds-ch3.pdf", { type: "application/pdf" }));
  const up = await call("POST", "/materials", fd);
  ok("POST /materials 201", up.status === 201, up);
  const upDto = validate("POST /materials 응답", MaterialCreateResponseSchema, up.data);
  ok("PENDING + sources 3 (MD/TXT/PDF)", upDto?.status === "PENDING" && upDto.sources.map((s) => s.kind).join() === "MD,TXT,PDF" && upDto.sources.every((s) => s.charCount > 0), upDto);
  const pdfSrc = await call("GET", `/sources/${upDto?.sources[2]?.sourceId}/content`);
  ok("PDF 텍스트 추출됨", /binary search trees/.test(String((pdfSrc.data as { text?: string })?.text)), pdfSrc.data);
  const newMat = validate("GET 업로드 자료", MaterialSchema, (await call("GET", `/materials/${upDto?.materialId}`)).data);
  ok("업로드 자료: PENDING, 제목 '새 자료', 챕터 0, examDate 2026-12-20", newMat?.status === "PENDING" && newMat.title === "새 자료" && newMat.chapters.length === 0 && newMat.examDate === "2026-12-20", newMat);
  const listAfterUp = validate("GET /materials (업로드 후)", z.array(MaterialListItemSchema), (await call("GET", "/materials")).data);
  ok("목록 3개, 최신 먼저(PENDING)", listAfterUp?.length === 3 && listAfterUp[0].materialId === upDto?.materialId && listAfterUp[0].chapterCount === 0, listAfterUp);

  const bad1 = new FormData();
  bad1.set("courseName", "x");
  expectError("업로드: 파일 없음", await call("POST", "/materials", bad1), 400, "VALIDATION");
  const bad2 = new FormData();
  bad2.set("courseName", "x");
  bad2.append("files[]", new File(["short"], "a.txt", { type: "text/plain" }));
  expectError("업로드: 텍스트 너무 짧음", await call("POST", "/materials", bad2), 400, "VALIDATION");
  const bad3 = new FormData();
  bad3.set("courseName", "x");
  bad3.append("files[]", new File(["x".repeat(100)], "a.docx"));
  expectError("업로드: 미지원 확장자", await call("POST", "/materials", bad3), 400, "VALIDATION");
  const bad4 = new FormData();
  bad4.append("files[]", new File(["x".repeat(100)], "a.txt"));
  expectError("업로드: 과목명 없음", await call("POST", "/materials", bad4), 400, "VALIDATION");
  const bad5 = new FormData();
  bad5.set("courseName", "x");
  bad5.set("examDate", "2026/12/20");
  bad5.append("files[]", new File(["x".repeat(100)], "a.txt"));
  expectError("업로드: 시험일 형식", await call("POST", "/materials", bad5), 400, "VALIDATION");
  const bad6 = new FormData();
  bad6.set("courseName", "x");
  for (let i = 0; i < 6; i++) bad6.append("files[]", new File(["x".repeat(100)], `a${i}.txt`));
  expectError("업로드: 6개 파일", await call("POST", "/materials", bad6), 400, "VALIDATION");
  expectError("업로드: multipart 아님", await call("POST", "/materials", { courseName: "x" }), 400, "VALIDATION");

  /* ── 세션 생성 → 전이 ── */
  console.log("\n[sessions: 생성/전이]");
  const chapter = detailDto!.chapters.find((c) => c.action.kind === "START")!;
  expectError("POST /sessions 본문 없음", await call("POST", "/sessions", {}), 400, "VALIDATION");
  expectError("POST /sessions 없는 챕터", await call("POST", "/sessions", { chapterId: "chp_nope" }), 404, "NOT_FOUND");
  const chapterBefore = await db.chapter.findUnique({ where: { id: chapter.chapterId }, select: { taughtAt: true, stableAt: true } });
  const created = await call("POST", "/sessions", { chapterId: chapter.chapterId, juniorLevel: "HARD" });
  ok("POST /sessions 201", created.status === 201, created);
  const sid = validate("POST /sessions 응답", CreateSessionResponseSchema, created.data)?.sessionId as string;

  const fresh = validate("GET 새 세션", SessionSchema, (await call("GET", `/sessions/${sid}`)).data);
  ok("PREPARING / QUESTION / HARD / exam null / 메시지 0", fresh?.status === "PREPARING" && fresh.phase === "QUESTION" && fresh.juniorLevel === "HARD" && fresh.exam === null && fresh.messages.length === 0, fresh);
  const matAfter = validate("GET 자료 (세션 생성 후)", MaterialSchema, (await call("GET", `/materials/${osMat?.materialId}`)).data);
  const chAfter = matAfter?.chapters.find((c) => c.chapterId === chapter.chapterId);
  ok("해당 챕터 action CONTINUE(PREPARING)", chAfter?.action.kind === "CONTINUE" && chAfter.action.sessionId === sid && chAfter.action.status === "PREPARING", chAfter?.action);
  const homeMid = validate("GET /home (PREPARING 세션)", HomeSchema, (await call("GET", "/home")).data);
  ok("홈 resume 은 가장 최근 진행 중 세션(PREPARING, 준비 중)", homeMid?.courses.find((c) => c.courseName === "운영체제")?.materials[0]?.resume?.sessionId === sid && homeMid.courses.find((c) => c.courseName === "운영체제")?.materials[0]?.resume?.stageLabel === "준비 중", homeMid?.courses);

  expectError("PATCH (PREPARING)", await call("PATCH", `/sessions/${sid}`, { juniorLevel: "EASY" }), 409, "INVALID_STATE");
  expectError("finish-explanation (PREPARING)", await call("POST", `/sessions/${sid}/finish-explanation`), 409, "INVALID_STATE");
  expectError("start-exam (PREPARING)", await call("POST", `/sessions/${sid}/start-exam`), 409, "INVALID_STATE");
  expectError("complete (PREPARING)", await call("POST", `/sessions/${sid}/complete`), 409, "INVALID_STATE");
  expectError("result (PREPARING)", await call("GET", `/sessions/${sid}/result`), 409, "INVALID_STATE");

  // D 의 prepare 를 흉내: EXPLAINING + objectives + Exam(READY) + 첫 질문
  const examId = newId("exam");
  await db.session.update({
    where: { id: sid },
    data: {
      status: "EXPLAINING",
      objectivesJson: JSON.stringify([{ id: "o1", text: "o1" }, { id: "o2", text: "o2" }, { id: "o3", text: "o3" }]),
      messages: { create: { id: newId("msg"), role: "JUNIOR", stage: "QUESTION", content: "선배, 뭐부터 알려줄래?" } },
      exam: {
        create: {
          id: examId,
          status: "READY",
          questions: {
            create: [34, 33, 33].map((points, i) => ({
              id: examItemId(examId, `q${i + 1}`), qid: `q${i + 1}`, order: i + 1, points, question: `문항 ${i + 1}`, objectiveRef: `o${i + 1}`, rubric: "비공개;채점기준",
            })),
          },
        },
      },
    },
  });
  const patched = await call("PATCH", `/sessions/${sid}`, { juniorLevel: "EASY" });
  const patchedDto = validate("PATCH (EXPLAINING) 세션 객체", SessionSchema, patched.data);
  ok("juniorLevel EASY 로 변경", patchedDto?.juniorLevel === "EASY", patchedDto);
  expectError("PATCH 잘못된 값", await call("PATCH", `/sessions/${sid}`, { juniorLevel: "MEDIUM" }), 400, "VALIDATION");
  expectError("finish-explanation (USER 메시지 0개)", await call("POST", `/sessions/${sid}/finish-explanation`), 409, "NO_EXPLANATION");
  expectError("start-exam (phase QUESTION)", await call("POST", `/sessions/${sid}/start-exam`), 409, "INVALID_STATE");

  const userMsg = await db.message.create({ data: { id: newId("msg"), sessionId: sid, role: "USER", stage: "ANSWER", content: "FCFS 는 먼저 온 순서대로 처리해." } });
  const junior = (patchedDto?.messages ?? [])[0];
  expectError("exclude: JUNIOR 메시지", await call("POST", `/sessions/${sid}/messages/${junior?.messageId}/exclude`), 409, "INVALID_STATE");
  expectError("exclude: 없는 메시지", await call("POST", `/sessions/${sid}/messages/msg_nope/exclude`), 404, "NOT_FOUND");
  validate("exclude: USER 메시지", OkResponseSchema, (await call("POST", `/sessions/${sid}/messages/${userMsg.id}/exclude`)).data);
  expectError("finish-explanation (USER 메시지가 전부 excluded)", await call("POST", `/sessions/${sid}/finish-explanation`), 409, "NO_EXPLANATION");
  await db.message.create({ data: { id: newId("msg"), sessionId: sid, role: "USER", stage: "ANSWER", content: "SJF 는 실행 시간이 짧은 것부터." } });

  const fin = await call("POST", `/sessions/${sid}/finish-explanation`);
  validate("finish-explanation", FinishExplanationResponseSchema, fin.data);
  validate("finish-explanation 두 번째(멱등)", FinishExplanationResponseSchema, (await call("POST", `/sessions/${sid}/finish-explanation`)).data);
  const afterFin = validate("GET 세션(EXAM_READY)", SessionSchema, (await call("GET", `/sessions/${sid}`)).data);
  ok("phase EXAM_READY", afterFin?.phase === "EXAM_READY" && afterFin.status === "EXPLAINING", afterFin);
  expectError("result (EXAM_READY)", await call("GET", `/sessions/${sid}/result`), 409, "INVALID_STATE");

  const start = await call("POST", `/sessions/${sid}/start-exam`);
  const startDto = validate("start-exam", StartExamResponseSchema, start.data);
  ok("EXAM_IN_PROGRESS + 문항 3 (rubric 없음)", startDto?.status === "EXAM_IN_PROGRESS" && startDto.exam.questions.length === 3 && !JSON.stringify(start.data).includes("rubric"), startDto);
  expectError("start-exam 두 번째", await call("POST", `/sessions/${sid}/start-exam`), 409, "INVALID_STATE");
  expectError("PATCH (EXAM_IN_PROGRESS)", await call("PATCH", `/sessions/${sid}`, { juniorLevel: "HARD" }), 409, "INVALID_STATE");
  expectError("complete (EXAM_IN_PROGRESS)", await call("POST", `/sessions/${sid}/complete`), 409, "INVALID_STATE");
  expectError("exclude (EXAM_IN_PROGRESS)", await call("POST", `/sessions/${sid}/messages/${userMsg.id}/exclude`), 409, "INVALID_STATE");
  const examRow = await db.exam.findUnique({ where: { sessionId: sid } });
  ok("Exam.status IN_PROGRESS", examRow?.status === "IN_PROGRESS", examRow);

  // D 의 evaluate 를 흉내: 답안·채점·gap → RESULT_READY
  await db.$transaction([
    db.examAnswer.createMany({
      data: [1, 2, 3].map((i) => ({ id: examItemId(examId, `q${i}`), examId, qid: `q${i}`, answer: `답안 ${i} 입니다.`, sentencesJson: JSON.stringify([{ sentence: `답안 ${i} 입니다.`, ref: i === 3 ? null : 1, level: i === 3 ? "NONE" : "STRONG", unlearned: i === 3 }]) })),
    }),
    db.grade.createMany({
      data: [
        { id: examItemId(examId, "q1"), examId, qid: "q1", score: 34, maxScore: 34, verdict: "CORRECT", comment: "좋아요" },
        { id: examItemId(examId, "q2"), examId, qid: "q2", score: 20, maxScore: 33, verdict: "PARTIAL", comment: "일부 빠짐" },
        { id: examItemId(examId, "q3"), examId, qid: "q3", score: 0, maxScore: 33, verdict: "WRONG", comment: "못 들음" },
      ],
    }),
    db.gap.createMany({
      data: [
        { id: newId("gap"), sessionId: sid, qid: "q2", title: "빠진 곳 1", diagnosis: "d", evidenceQuote: "", conceptsJson: "[]", sourceExcerpt: "s" },
        { id: newId("gap"), sessionId: sid, qid: "q3", title: "빠진 곳 2", diagnosis: "d", evidenceQuote: "", conceptsJson: "[]", sourceExcerpt: "s" },
      ],
    }),
    db.exam.update({ where: { id: examId }, data: { status: "GRADED" } }),
    db.session.update({ where: { id: sid }, data: { status: "RESULT_READY", score: 54, finalVerdict: "NEEDS_WORK" } }),
  ]);

  const res = await call("GET", `/sessions/${sid}/result`);
  const resDto = validate("GET result (RESULT_READY)", ResultSchema, res.data);
  ok("total 54, 1/1/1, gaps 2 FOUND, NEEDS_WORK", resDto?.totalScore === 54 && resDto.correctCount === 1 && resDto.partialCount === 1 && resDto.wrongCount === 1 && resDto.gaps.length === 2 && resDto.gaps.every((g) => g.status === "FOUND") && resDto.finalVerdict === "NEEDS_WORK", resDto);
  ok("result items 순서 q1,q2,q3 + unlearned 문장", resDto?.items.map((i) => i.qid).join() === "q1,q2,q3" && resDto.items[2].sentences[0]?.unlearned === true, resDto?.items);
  const [g1, g2] = resDto?.gaps ?? [];
  expectError("reviewed: 없는 gap", await call("POST", `/sessions/${sid}/gaps/gap_nope/reviewed`), 404, "NOT_FOUND");
  const rv1 = validate("reviewed gap1", ReviewedResponseSchema, (await call("POST", `/sessions/${sid}/gaps/${g1?.gapId}/reviewed`)).data);
  ok("remaining 1, 세션 REVIEWING", rv1?.remaining === 1 && (await db.session.findUnique({ where: { id: sid } }))?.status === "REVIEWING", rv1);
  const rv1b = validate("reviewed gap1 (다시)", ReviewedResponseSchema, (await call("POST", `/sessions/${sid}/gaps/${g1?.gapId}/reviewed`)).data);
  ok("멱등 remaining 1", rv1b?.remaining === 1, rv1b);
  const sessListNow = validate("GET /sessions (REVIEWING 포함)", z.array(SessionListItemSchema), (await call("GET", "/sessions")).data);
  ok("REVIEWING stageLabel 되짚기", sessListNow?.find((s) => s.sessionId === sid)?.stageLabel === "되짚기", sessListNow);
  const resRev = validate("GET result (REVIEWING)", ResultSchema, (await call("GET", `/sessions/${sid}/result`)).data);
  ok("gap1 REVIEWED / gap2 FOUND", resRev?.gaps.find((g) => g.gapId === g1?.gapId)?.status === "REVIEWED" && resRev.gaps.find((g) => g.gapId === g2?.gapId)?.status === "FOUND", resRev?.gaps);

  const comp = await call("POST", `/sessions/${sid}/complete`);
  const compDto = validate("complete", CompleteResponseSchema, comp.data);
  ok("COMPLETED, score 54, openGapCount 1, taughtAt 세팅, stableAt null", compDto?.status === "COMPLETED" && compDto.score === 54 && compDto.finalVerdict === "NEEDS_WORK" && compDto.openGapCount === 1 && !!compDto.chapter.taughtAt && compDto.chapter.stableAt === null, compDto);
  expectError("complete 두 번째", await call("POST", `/sessions/${sid}/complete`), 409, "INVALID_STATE");
  expectError("reviewed (COMPLETED)", await call("POST", `/sessions/${sid}/gaps/${g2?.gapId}/reviewed`), 409, "INVALID_STATE");
  const resDone = validate("GET result (COMPLETED)", ResultSchema, (await call("GET", `/sessions/${sid}/result`)).data);
  ok("result.chapter.taughtAt 세팅", !!resDone?.chapter.taughtAt, resDone?.chapter);
  const sDone = validate("GET 세션 (COMPLETED)", SessionSchema, (await call("GET", `/sessions/${sid}`)).data);
  ok("세션 COMPLETED score 54 gapCount 2", sDone?.status === "COMPLETED" && sDone.score === 54 && sDone.gapCount === 2, sDone);

  const matDone = validate("GET 자료 (완료 후)", MaterialSchema, (await call("GET", `/materials/${osMat?.materialId}`)).data);
  const chDone = matDone?.chapters.find((c) => c.chapterId === chapter.chapterId);
  ok("챕터 RETRY / bestScore 54 / openGapCount 1 / taughtAt", chDone?.action.kind === "RETRY" && chDone.bestScore === 54 && chDone.openGapCount === 1 && !!chDone.taughtAt, chDone);
  const homeDone = validate("GET /home (완료 후)", HomeSchema, (await call("GET", "/home")).data);
  ok("홈 completedSessions 2, 평균 74, 연속 2일(어제+오늘), taughtCount 시드+1", homeDone?.stats.completedSessions === 2 && homeDone.stats.averageScore === 74 && homeDone.stats.streakDays === 2 && homeDone.courses.find((c) => c.courseName === "운영체제")?.materials[0]?.taughtCount === (chapterBefore?.taughtAt ? 4 : 5), homeDone?.stats);
  const meDone = validate("GET /auth/me (완료 후)", MeSchema, (await call("GET", "/auth/me")).data);
  ok("me.streakDays 2", meDone?.streakDays === 2, meDone);

  /* ── gap 0개 완료 → stableAt ── */
  console.log("\n[stable]");
  const econ = validate("GET 경제 자료", MaterialSchema, (await call("GET", `/materials/${econMat?.materialId}`)).data);
  const econCh = econ!.chapters[0];
  const sid2 = validate("POST /sessions (경제)", CreateSessionResponseSchema, (await call("POST", "/sessions", { chapterId: econCh.chapterId })).data)!.sessionId;
  const exam2 = newId("exam");
  await db.session.update({
    where: { id: sid2 },
    data: {
      status: "RESULT_READY", phase: "EXAM_READY", score: 100, finalVerdict: "STABLE",
      messages: { create: { id: newId("msg"), role: "USER", stage: "ANSWER", content: "수요 법칙." } },
      exam: { create: { id: exam2, status: "GRADED", questions: { create: [{ id: examItemId(exam2, "q1"), qid: "q1", order: 1, points: 100, question: "?", objectiveRef: "o1", rubric: "r" }] }, answers: { create: [{ id: examItemId(exam2, "q1"), qid: "q1", answer: "a", sentencesJson: "[]" }] }, grades: { create: [{ id: examItemId(exam2, "q1"), qid: "q1", score: 100, maxScore: 100, verdict: "CORRECT", comment: "c" }] } } },
    },
  });
  const comp2 = validate("complete (gap 0)", CompleteResponseSchema, (await call("POST", `/sessions/${sid2}/complete`)).data);
  ok("STABLE + stableAt 세팅 + openGapCount 0", comp2?.finalVerdict === "STABLE" && !!comp2.chapter.stableAt && comp2.openGapCount === 0, comp2);

  /* ── 삭제 ── */
  console.log("\n[delete]");
  validate("DELETE /sessions/{id}", OkResponseSchema, (await call("DELETE", `/sessions/${sid2}`)).data);
  expectError("삭제된 세션 조회", await call("GET", `/sessions/${sid2}`), 404, "NOT_FOUND");
  ok("세션 삭제 시 Exam cascade", (await db.exam.findUnique({ where: { id: exam2 } })) === null);
  validate("DELETE /materials/{id} (업로드 자료)", OkResponseSchema, (await call("DELETE", `/materials/${upDto?.materialId}`)).data);
  expectError("삭제된 자료 조회", await call("GET", `/materials/${upDto?.materialId}`), 404, "NOT_FOUND");
  ok("자료 삭제 시 Source cascade", (await db.source.count({ where: { materialId: upDto?.materialId } })) === 0);
  // 세션이 달린 자료 삭제: 챕터/세션까지 cascade 되는지
  const fd2 = new FormData();
  fd2.set("courseName", "삭제테스트");
  fd2.append("files[]", new File(["삭제 테스트용 자료입니다. 챕터 하나를 수동으로 만들어 세션까지 지워지는지 확인합니다."], "del.txt"));
  const upDel = validate("업로드(삭제 테스트)", MaterialCreateResponseSchema, (await call("POST", "/materials", fd2)).data)!;
  expectError("POST /sessions (PENDING 자료 챕터 없음)", await call("POST", "/sessions", { chapterId: "chp_none" }), 404, "NOT_FOUND");
  const chDel = await db.chapter.create({ data: { id: newId("chp"), materialId: upDel.materialId, order: 1, title: "t", pointsJson: "[]", sourceId: upDel.sources[0].sourceId, startOffset: 0, endOffset: 10 } });
  expectError("POST /sessions (자료 PENDING)", await call("POST", "/sessions", { chapterId: chDel.id }), 409, "INVALID_STATE");
  await db.material.update({ where: { id: upDel.materialId }, data: { status: "READY" } });
  const sidDel = validate("POST /sessions (삭제 테스트)", CreateSessionResponseSchema, (await call("POST", "/sessions", { chapterId: chDel.id })).data)!.sessionId;
  validate("DELETE /materials/{id} (세션 포함)", OkResponseSchema, (await call("DELETE", `/materials/${upDel.materialId}`)).data);
  ok("자료 삭제 시 Chapter/Session cascade", (await db.session.findUnique({ where: { id: sidDel } })) === null && (await db.chapter.findUnique({ where: { id: chDel.id } })) === null);

  /* ── 정리: 테스트가 만든 세션 삭제(시드 상태 복원) ── */
  validate("DELETE 테스트 세션", OkResponseSchema, (await call("DELETE", `/sessions/${sid}`)).data);
  await db.chapter.update({ where: { id: chapter.chapterId }, data: { taughtAt: chapterBefore?.taughtAt ?? null, stableAt: chapterBefore?.stableAt ?? null } });
  await db.chapter.update({ where: { id: econCh.chapterId }, data: { taughtAt: null, stableAt: null } });
  const homeRestored = validate("GET /home (복원)", HomeSchema, (await call("GET", "/home")).data);
  ok("시드 상태 복원 (완료 1, 94점)", homeRestored?.stats.completedSessions === 1 && homeRestored.stats.averageScore === 94, homeRestored?.stats);

  await db.juniorRun.updateMany({ where: { id: { in: pausedRuns.map((r) => r.id) } }, data: { status: "ACTIVE" } });
  for (const session of pausedSessions) await db.session.update({ where: { id: session.id }, data: { runId: session.runId, character: session.character } });
  await gameSmoke();

  /* ── 로그아웃 ── */
  console.log("\n[logout]");
  const out = await call("POST", "/auth/logout");
  validate("POST /auth/logout", OkResponseSchema, out.data);
  ok("쿠키 삭제 헤더", /Max-Age=0/.test(out.headers.get("set-cookie") ?? ""), out.headers.get("set-cookie"));
  cookie = "";
  expectError("GET /home (로그아웃 후)", await call("GET", "/home"), 401, "UNAUTHORIZED");
  cookie = "tb_uid=usr_ghost";
  expectError("GET /home (없는 사용자 쿠키)", await call("GET", "/home"), 401, "UNAUTHORIZED");

  console.log(`\nsmoke: ${passed} passed, ${failed} failed`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

/* ───────── [① 게임 코어] Run · LIFE · 졸업 ───────── */
async function login(userId: string) {
  const r = await call("POST", "/auth/demo-login", { userId });
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
}

/** POST /sessions 로 만든 뒤 D 의 채점을 흉내(DB 로 RESULT_READY + score) */
async function gradedSession(chapterId: string, score: number, body: Record<string, unknown> = {}) {
  const r = await call("POST", "/sessions", { chapterId, ...body });
  const sid = (r.data as { sessionId: string }).sessionId;
  await db.session.update({ where: { id: sid }, data: { status: "RESULT_READY", phase: "EXAM_READY", score, finalVerdict: score >= 70 ? "MOSTLY" : "NEEDS_WORK" } });
  return sid;
}

async function gameSmoke() {
  console.log("\n[game: Run]");
  await login("usr_demo1");
  const created: { sessions: string[]; runs: string[] } = { sessions: [], runs: [] };
  const mats = (await call("GET", "/materials")).data as Array<{ materialId: string; courseName: string }>;
  const osId = mats.find((m) => m.courseName === "운영체제")!.materialId;
  const econId = mats.find((m) => m.courseName === "경제학원론")!.materialId;

  const cur = validate("GET /runs/current", CurrentRunResponseSchema, (await call("GET", "/runs/current")).data);
  const r1 = cur?.run;
  ok("체험1 시드 Run: KU ♥♥♡ 4/6, next 4번 챕터, 졸업 불가", r1?.character === "KU_HARD" && r1.lives === 2 && r1.maxLives === 3 && r1.progress.cleared === 4 && r1.progress.total === 6 && r1.next?.title === r1.progress.chapters[3].title && !r1.canGraduate, r1);
  ok("KU 합격선 80 · 서술형", r1?.passScore === 80 && r1.examFormat === "DESCRIPTIVE", r1);
  const curOs = validate("GET /runs/current?materialId=운영체제", CurrentRunResponseSchema, (await call("GET", `/runs/current?materialId=${osId}`)).data);
  ok("자료 지정 조회 = 같은 Run", curOs?.run?.runId === r1?.runId);
  const curEcon = validate("GET /runs/current?materialId=경제", CurrentRunResponseSchema, (await call("GET", `/runs/current?materialId=${econId}`)).data);
  ok("Run 없는 자료 → run null (200)", curEcon?.run === null, curEcon);
  expectError("POST /runs 같은 자료 중복", await call("POST", "/runs", { materialId: osId, character: "MALE_EASY" }), 409, "RUN_ACTIVE");
  expectError("POST /runs 잘못된 캐릭터", await call("POST", "/runs", { materialId: econId, character: "BOSS" }), 400, "VALIDATION");
  expectError("POST /runs maxLives 4", await call("POST", "/runs", { materialId: econId, character: "MALE_EASY", maxLives: 4 }), 400, "VALIDATION");
  expectError("POST /runs 남의/없는 자료", await call("POST", "/runs", { materialId: "mat_nope", character: "MALE_EASY" }), 404, "NOT_FOUND");

  const newRun = await call("POST", "/runs", { materialId: econId, character: "MALE_EASY", maxLives: 5 });
  ok("POST /runs 201", newRun.status === 201, newRun);
  const run = validate("POST /runs 응답", RunSchema, newRun.data) as RunDto;
  created.runs.push(run.runId);
  ok("컴돌이: ♥5/5, 0/5, 합격선 60, 객관식", run.lives === 5 && run.maxLives === 5 && run.progress.cleared === 0 && run.progress.total === 5 && run.passScore === 60 && run.examFormat === "OBJECTIVE", run);
  ok("next = 첫 챕터", run.next?.chapterId === run.progress.chapters[0].chapterId);
  validate("GET /runs/{id}", RunSchema, (await call("GET", `/runs/${run.runId}`)).data);
  expectError("GET /runs/없는id", await call("GET", "/runs/run_nope"), 404, "NO_RUN");

  console.log("\n[game: 강의노트]");
  const tn = validate("GET /materials/{id}/teacher-note", TeacherNoteListResponseSchema, (await call("GET", `/materials/${osId}/teacher-note`)).data);
  ok("챕터 6개 행 (note 는 있거나 null)", tn?.chapters.length === 6 && tn.chapters.every((c) => c.note === null || c.note.chapterId === c.chapterId), tn?.chapters.map((c) => [c.title, !!c.note]));
  expectError("teacher-note: 남의/없는 자료", await call("GET", "/materials/mat_nope/teacher-note"), 404, "NOT_FOUND");
  expectError("teacher-note POST: 다른 자료의 챕터", await call("POST", `/materials/${osId}/teacher-note`, { chapterId: run.progress.chapters[0].chapterId }), 404, "NOT_FOUND");
  expectError("teacher-note POST: 본문 없음", await call("POST", `/materials/${osId}/teacher-note`, {}), 400, "VALIDATION");

  console.log("\n[game: 객관식 보기]");
  {
    const sid = (await call("POST", "/sessions", { chapterId: run.progress.chapters[0].chapterId })).data as { sessionId: string };
    created.sessions.push(sid.sessionId);
    const ex = newId("exam");
    await db.session.update({ where: { id: sid.sessionId }, data: { status: "EXPLAINING", phase: "EXAM_READY", exam: { create: { id: ex, status: "READY", format: "OBJECTIVE", questions: { create: [{ id: examItemId(ex, "q1"), qid: "q1", order: 1, points: 34, question: "?", objectiveRef: "o1", rubric: "2", choicesJson: JSON.stringify(["가", "나", "다", "라"]) }] } } } } });
    const st = validate("start-exam (객관식)", StartExamResponseSchema, (await call("POST", `/sessions/${sid.sessionId}/start-exam`)).data);
    ok("start-exam 응답에 보기 4개 + rubric 미노출", st?.exam.questions[0].choices?.join() === "가,나,다,라" && !JSON.stringify(st).includes("rubric"), st);
    const sd = validate("GET 세션 (객관식)", SessionSchema, (await call("GET", `/sessions/${sid.sessionId}`)).data);
    ok("세션 객체에도 보기 4개", sd?.exam?.questions[0].choices?.length === 4, sd?.exam);
  }

  console.log("\n[game: 세션 연결]");
  const ch = run.progress.chapters;
  const s1 = (await call("POST", "/sessions", { chapterId: ch[0].chapterId, juniorLevel: "HARD" })).data as { sessionId: string };
  created.sessions.push(s1.sessionId);
  const s1Row = await db.session.findUnique({ where: { id: s1.sessionId } });
  ok("세션 생성 시 runId 연결 + juniorLevel 을 후배(EASY)로 강제", s1Row?.runId === run.runId && s1Row.juniorLevel === "EASY", s1Row);
  await db.session.update({ where: { id: s1.sessionId }, data: { status: "EXPLAINING" } });
  expectError("PATCH juniorLevel (Run 세션)", await call("PATCH", `/sessions/${s1.sessionId}`, { juniorLevel: "HARD" }), 409, "INVALID_STATE");
  const g1 = validate("GET /sessions/{id}/game", SessionGameSchema, (await call("GET", `/sessions/${s1.sessionId}/game`)).data);
  ok("game: run 포함, 합격선 60, 객관식, lifeEvent null", g1?.run?.runId === run.runId && g1.passScore === 60 && g1.examFormat === "OBJECTIVE" && g1.lifeEvent === null && Array.isArray(g1.mastery), g1);
  expectError("life: 채점 전 세션", await call("POST", `/runs/${run.runId}/life`, { sessionId: s1.sessionId }), 409, "INVALID_STATE");
  expectError("life: 본문 없음", await call("POST", `/runs/${run.runId}/life`, {}), 400, "VALIDATION");

  console.log("\n[game: LIFE]");
  const fail = await gradedSession(ch[0].chapterId, 55);
  created.sessions.push(fail);
  const lf = validate("life FAILED", ApplyLifeResponseSchema, (await call("POST", `/runs/${run.runId}/life`, { sessionId: fail })).data);
  ok("55점 < 60 → FAILED, ♥5→4, 미통과", lf?.applied === true && lf.outcome === "FAILED" && lf.livesBefore === 5 && lf.livesAfter === 4 && !lf.chapter.cleared && lf.chapter.bestScore === 55 && lf.runStatus === "ACTIVE", lf);
  const lf2 = validate("life 재호출", ApplyLifeResponseSchema, (await call("POST", `/runs/${run.runId}/life`, { sessionId: fail })).data);
  ok("재호출 멱등: applied false, 같은 결과", lf2?.applied === false && lf2.outcome === "FAILED" && lf2.livesAfter === 4, lf2);
  ok("LifeEvent 1개만 생성", (await db.lifeEvent.count({ where: { sessionId: fail } })) === 1);
  const g2 = validate("game (적용 후)", SessionGameSchema, (await call("GET", `/sessions/${fail}/game`)).data);
  ok("game.lifeEvent FAILED −1", g2?.lifeEvent?.outcome === "FAILED" && g2.lifeEvent.delta === -1, g2?.lifeEvent);
  const runAfter = validate("GET /runs/{id} (실패 후)", RunSchema, (await call("GET", `/runs/${run.runId}`)).data);
  ok("progress: 1번 챕터 시도 1, 최고 55", runAfter?.lives === 4 && runAfter.progress.chapters[0].attempts === 1 && runAfter.progress.chapters[0].bestScore === 55, runAfter?.progress.chapters[0]);

  const perfect = await gradedSession(ch[0].chapterId, 100);
  created.sessions.push(perfect);
  const lp = validate("life PERFECT", ApplyLifeResponseSchema, (await call("POST", `/runs/${run.runId}/life`, { sessionId: perfect })).data);
  ok("100점 → PERFECT ♥4→5, 첫 통과", lp?.outcome === "PERFECT" && lp.livesBefore === 4 && lp.livesAfter === 5 && lp.chapter.cleared && lp.chapter.firstClear && lp.chapter.bestScore === 100, lp);
  const perfect2 = await gradedSession(ch[0].chapterId, 100);
  created.sessions.push(perfect2);
  const lp2 = validate("life PERFECT (가득)", ApplyLifeResponseSchema, (await call("POST", `/runs/${run.runId}/life`, { sessionId: perfect2 })).data);
  ok("LIFE 가득일 때 100점 → PERFECT 이지만 ♥ 그대로, firstClear false", lp2?.outcome === "PERFECT" && lp2.livesAfter === 5 && lp2.livesBefore === 5 && !lp2.chapter.firstClear, lp2);
  const clear = await gradedSession(ch[1].chapterId, 60);
  created.sessions.push(clear);
  const lc = validate("life CLEAR", ApplyLifeResponseSchema, (await call("POST", `/runs/${run.runId}/life`, { sessionId: clear })).data);
  ok("60점 = 합격선 → CLEAR ♥ 변화 없음, 통과", lc?.outcome === "CLEAR" && lc.livesAfter === 5 && lc.chapter.cleared, lc);

  const practice = await gradedSession(ch[2].chapterId, 90);
  await db.session.update({ where: { id: practice }, data: { runId: null, character: null } });
  created.sessions.push(practice);
  expectError("life: Run 없는(연습) 세션", await call("POST", `/runs/${run.runId}/life`, { sessionId: practice }), 404, "NO_RUN");
  const gp = validate("game (연습 세션)", SessionGameSchema, (await call("GET", `/sessions/${practice}/game`)).data);
  ok("연습 세션 game: run null, passScore null, DESCRIPTIVE", gp?.run === null && gp.passScore === null && gp.examFormat === "DESCRIPTIVE", gp);
  expectError("life: 남의 Run", await call("POST", `/runs/${r1!.runId}/life`, { sessionId: clear }), 404, "NO_RUN");

  console.log("\n[game: 오답노트]");
  // 실패 세션(55점)에 채점 기록을 붙인다: q1 PARTIAL + 놓친 곳, q2 CORRECT
  const wnExam = newId("exam");
  await db.exam.create({
    data: {
      id: wnExam, sessionId: fail, status: "GRADED", format: "OBJECTIVE",
      questions: { create: [
        { id: examItemId(wnExam, "q1"), qid: "q1", order: 1, points: 34, question: "수요 법칙은?", objectiveRef: "o1", rubric: "2", choicesJson: JSON.stringify(["①", "②", "③", "④"]) },
        { id: examItemId(wnExam, "q2"), qid: "q2", order: 2, points: 33, question: "수요의 변화는?", objectiveRef: "o2", rubric: "r" },
      ] },
      answers: { create: [
        { id: examItemId(wnExam, "q1"), qid: "q1", answer: "① 가격이 오르면 수요량도 늘어납니다.", sentencesJson: "[]" },
        { id: examItemId(wnExam, "q2"), qid: "q2", answer: "곡선이 이동합니다.", sentencesJson: "[]" },
      ] },
      grades: { create: [
        { id: examItemId(wnExam, "q1"), qid: "q1", score: 0, maxScore: 34, verdict: "WRONG", comment: "수요 법칙 방향이 반대입니다." },
        { id: examItemId(wnExam, "q2"), qid: "q2", score: 33, maxScore: 33, verdict: "CORRECT", comment: "정확합니다." },
      ] },
    },
  });
  await db.message.create({ data: { id: newId("msg"), sessionId: fail, role: "USER", stage: "ANSWER", content: "가격이 오르면 수요량도 늘어." } });
  await db.gap.create({ data: { id: newId("gap"), sessionId: fail, qid: "q1", title: "수요 법칙 방향이 반대", diagnosis: "새내기 답안은 가격과 수요량이 같은 방향이라고 썼습니다.", evidenceQuote: "가격이 오르면 수요량도 늘어.", conceptsJson: JSON.stringify(["수요 법칙"]), sourceExcerpt: "가격이 오르면 수요량이 줄어든다." } });
  expectError("오답노트: 맞힌 문항", await call("POST", "/wrong-notes", { sessionId: fail, qid: "q2", userReason: "?" }), 409, "INVALID_STATE");
  expectError("오답노트: 없는 문항", await call("POST", "/wrong-notes", { sessionId: fail, qid: "q9", userReason: "?" }), 404, "NOT_FOUND");
  expectError("오답노트: 채점 전 세션", await call("POST", "/wrong-notes", { sessionId: s1.sessionId, qid: "q1", userReason: "x" }), 409, "INVALID_STATE");
  // 자동 저장: 결과 조회만 해도 틀린 문항(q1)이 오답노트에 들어간다. 맞힌 q2 는 들어가지 않는다.
  await call("GET", `/sessions/${fail}/result`);
  const auto = await db.wrongNote.findMany({ where: { sessionId: fail } });
  ok("결과 조회 시 틀린 문항만 자동 저장(이유 빈칸, 비교 없음)", auto.length === 1 && auto[0].qid === "q1" && auto[0].userReason === "" && auto[0].aiComparison === null && auto[0].aiDiagnosis.includes("수요 법칙 방향이 반대"), auto);
  await call("GET", `/sessions/${fail}/result`);
  ok("재조회해도 중복 저장 없음", (await db.wrongNote.count({ where: { sessionId: fail } })) === 1);
  const autoList = validate("GET /wrong-notes (자동 저장분)", WrongNoteListResponseSchema, (await call("GET", `/wrong-notes?materialId=${econId}`)).data);
  ok("목록에 이유 빈칸 노트 1개", autoList?.notes.length === 1 && autoList.notes[0].userReason === "" && autoList.notes[0].aiComparison === null, autoList);
  expectError("PATCH 이유 공백", await call("PATCH", `/wrong-notes/${auto[0].id}`, { userReason: "  " }), 400, "VALIDATION");
  const wnRes = await call("PATCH", `/wrong-notes/${auto[0].id}`, { userReason: "수요 법칙을 반대로 설명했다" });
  ok("PATCH /wrong-notes/{id} 200", wnRes.status === 200, wnRes);
  const wn = validate("PATCH /wrong-notes 응답", WrongNoteSchema, wnRes.data);
  ok("오답노트: 보기·답·점수·진단·근거·놓친 개념·비교", wn?.choices?.length === 4 && wn.verdict === "WRONG" && wn.score === 0 && wn.maxScore === 34 && wn.runId === run.runId && wn.aiDiagnosis.includes("수요 법칙 방향이 반대") && wn.evidenceQuote === "가격이 오르면 수요량도 늘어." && wn.missedConcepts.join() === "수요 법칙" && !!wn.aiComparison?.includes("수요 법칙"), wn);
  const wnAgain = await call("POST", "/wrong-notes", { sessionId: fail, qid: "q1", userReason: "다른 이유" });
  ok("POST 같은 문항 → 기존 노트 200, 이미 쓴 이유는 덮지 않음", wnAgain.status === 200 && (wnAgain.data as { wrongNoteId: string }).wrongNoteId === wn?.wrongNoteId && (wnAgain.data as { userReason: string }).userReason === "수요 법칙을 반대로 설명했다", wnAgain);
  const wnList = validate("GET /wrong-notes?materialId=", WrongNoteListResponseSchema, (await call("GET", `/wrong-notes?materialId=${econId}`)).data);
  ok("목록에 1개", wnList?.notes.length === 1 && wnList.notes[0].wrongNoteId === wn?.wrongNoteId, wnList);
  const wnOther = validate("GET /wrong-notes?materialId=운영체제", WrongNoteListResponseSchema, (await call("GET", `/wrong-notes?materialId=${osId}`)).data);
  ok("다른 자료 필터: 운영체제 시드 세션(94점)의 부분 정답 q3 만 백필", wnOther?.notes.length === 1 && wnOther.notes[0].qid === "q3" && wnOther.notes[0].verdict === "PARTIAL" && wnOther.notes[0].userReason === "" && wnOther.notes.every((n) => n.wrongNoteId !== wn?.wrongNoteId), wnOther);
  validate("GET /wrong-notes/{id}", WrongNoteSchema, (await call("GET", `/wrong-notes/${wn?.wrongNoteId}`)).data);
  expectError("GET /wrong-notes/없는id", await call("GET", "/wrong-notes/wn_nope"), 404, "NOT_FOUND");
  const rt = await call("POST", `/wrong-notes/${wn?.wrongNoteId}/reteach`);
  const rtDto = validate("POST /wrong-notes/{id}/reteach", ReteachResponseSchema, rt.data);
  created.sessions.push(rtDto!.sessionId);
  const rtRow = await db.session.findUnique({ where: { id: rtDto!.sessionId } });
  ok("다시 가르치기: 같은 챕터·Run 연결·집중 개념 저장", rt.status === 201 && rtRow?.chapterId === ch[0].chapterId && rtRow.runId === run.runId && rtRow.status === "PREPARING" && JSON.parse(rtRow.focusConceptsJson ?? "[]").join() === "수요 법칙" && rtDto?.focusConcepts.join() === "수요 법칙", rtRow);

  console.log("\n[game: 졸업]");
  expectError("graduate: 미통과 챕터 있음", await call("POST", `/runs/${run.runId}/graduate`), 409, "NOT_READY");
  let last = null as z.infer<typeof ApplyLifeResponseSchema> | null;
  for (const c of ch.slice(2)) {
    const sid = await gradedSession(c.chapterId, 75);
    created.sessions.push(sid);
    last = ApplyLifeResponseSchema.parse((await call("POST", `/runs/${run.runId}/life`, { sessionId: sid })).data);
  }
  ok("마지막 챕터 통과 → 아직 canGraduate false (졸업시험 남음)", last?.canGraduate === false && last.chapter.cleared, last);

  console.log("\n[game: 졸업시험]");
  const runReady = validate("GET /runs/{id} (챕터 전부 통과)", RunSchema, (await call("GET", `/runs/${run.runId}`)).data);
  ok("finalExam READY · 10문항 · 응시 0", runReady?.finalExam.status === "READY" && runReady.finalExam.questionCount === 10 && runReady.finalExam.attempts === 0 && !runReady.canGraduate, runReady?.finalExam);
  expectError("graduate: 졸업시험 전", await call("POST", `/runs/${run.runId}/graduate`), 409, "NOT_READY");
  const taughtCount = await db.message.count({ where: { role: "USER", excluded: false, session: { runId: run.runId, kind: "CHAPTER" } } });
  const fin = await call("POST", `/runs/${run.runId}/final`);
  const finDto = validate("POST /runs/{id}/final", StartFinalResponseSchema, fin.data);
  created.sessions.push(finDto!.sessionId);
  const finRow = await db.session.findUnique({ where: { id: finDto!.sessionId }, include: { messages: true } });
  ok("졸업시험 세션 생성: FINAL·Run 연결·PREPARING·가르친 설명 옮겨 담기", fin.status === 201 && finDto?.created === true && finRow?.kind === "FINAL" && finRow.runId === run.runId && finRow.status === "PREPARING" && finRow.messages.length === taughtCount && taughtCount > 0, { taughtCount, n: finRow?.messages.length });
  const fin2 = validate("final 재호출", StartFinalResponseSchema, (await call("POST", `/runs/${run.runId}/final`)).data);
  ok("진행 중 졸업시험 재사용 (created false)", fin2?.sessionId === finDto?.sessionId && fin2?.created === false, fin2);
  const gFin = validate("game (졸업시험)", SessionGameSchema, (await call("GET", `/sessions/${finDto!.sessionId}/game`)).data);
  ok("졸업시험 game: kind FINAL · 10문항 · MIXED", gFin?.kind === "FINAL" && gFin.questionCount === 10 && gFin.examFormat === "MIXED", gFin);
  const finSess = (await call("GET", `/sessions/${finDto!.sessionId}`)).data as { chapter: { title: string } };
  ok("졸업시험 세션 제목 = '<자료> 졸업시험'", finSess.chapter.title.endsWith("졸업시험"), finSess.chapter);
  const runIn = validate("GET /runs/{id} (졸업시험 중)", RunSchema, (await call("GET", `/runs/${run.runId}`)).data);
  ok("finalExam IN_PROGRESS + sessionId", runIn?.finalExam.status === "IN_PROGRESS" && runIn.finalExam.sessionId === finDto?.sessionId, runIn?.finalExam);
  const matDto = (await call("GET", `/materials/${econId}`)).data as { chapters: Array<{ chapterId: string; action: { kind: string; sessionId?: string } }> };
  ok("자료 화면 챕터 행동에 졸업시험 세션이 끼지 않음", matDto.chapters.every((c) => c.action.sessionId !== finDto?.sessionId), matDto.chapters.map((c) => c.action));
  const progressBefore = JSON.stringify(runIn?.progress);
  await db.session.update({ where: { id: finDto!.sessionId }, data: { status: "RESULT_READY", phase: "EXAM_READY", score: 55, finalVerdict: "NEEDS_WORK" } });
  const lfFin = validate("life (졸업시험 불합격)", ApplyLifeResponseSchema, (await call("POST", `/runs/${run.runId}/life`, { sessionId: finDto!.sessionId })).data);
  ok("졸업시험 55점 → FAILED ♥5→4, 졸업 불가", lfFin?.outcome === "FAILED" && lfFin.livesAfter === 4 && !lfFin.chapter.cleared && !lfFin.canGraduate, lfFin);
  const runFail = validate("GET /runs/{id} (졸업시험 불합격 후)", RunSchema, (await call("GET", `/runs/${run.runId}`)).data);
  ok("finalExam READY · 응시 1 · 최고 55, 챕터 진행 그대로", runFail?.finalExam.status === "READY" && runFail.finalExam.attempts === 1 && runFail.finalExam.bestScore === 55 && JSON.stringify(runFail.progress) === progressBefore, runFail?.finalExam);
  const fin3 = validate("final 재응시", StartFinalResponseSchema, (await call("POST", `/runs/${run.runId}/final`)).data);
  created.sessions.push(fin3!.sessionId);
  ok("재응시는 새 세션", fin3?.created === true && fin3.sessionId !== finDto?.sessionId, fin3);
  await db.session.update({ where: { id: fin3!.sessionId }, data: { status: "RESULT_READY", phase: "EXAM_READY", score: 80, finalVerdict: "MOSTLY" } });
  last = ApplyLifeResponseSchema.parse((await call("POST", `/runs/${run.runId}/life`, { sessionId: fin3!.sessionId })).data);
  ok("졸업시험 80점 → CLEAR, canGraduate true", last.outcome === "CLEAR" && last.chapter.cleared && last.canGraduate === true, last);
  const runPass = validate("GET /runs/{id} (졸업시험 통과)", RunSchema, (await call("GET", `/runs/${run.runId}`)).data);
  ok("finalExam PASSED · 최고 80 · 응시 2", runPass?.finalExam.status === "PASSED" && runPass.finalExam.bestScore === 80 && runPass.finalExam.attempts === 2 && runPass.canGraduate, runPass?.finalExam);
  expectError("final: 이미 통과", await call("POST", `/runs/${run.runId}/final`), 409, "NOT_READY");
  const gradRes = validate("POST /runs/{id}/graduate", GraduateResponseSchema, (await call("POST", `/runs/${run.runId}/graduate`)).data);
  const grad = gradRes?.summary;
  ok("graduate 응답 run = GRADUATED", gradRes?.run.status === "GRADUATED" && gradRes.run.runId === run.runId, gradRes?.run);
  ok("졸업 요약: 챕터 5, 시험 9(졸업시험 2 포함), PERFECT 2, 오답노트 1, 최종 ♥4/5", grad?.chapters === 5 && grad.exams === 9 && grad.perfectCount === 2 && grad.wrongNoteCount === 1 && grad.finalLives === 4 && grad.maxLives === 5 && grad.character === "MALE_EASY" && grad.days >= 1, grad);
  ok("졸업 요약 평균 = 시험 점수 평균", grad?.averageScore === Math.round((55 + 100 + 100 + 60 + 75 * 3 + 55 + 80) / 9), grad?.averageScore);
  const grad2 = validate("graduate 재호출", GraduateResponseSchema, (await call("POST", `/runs/${run.runId}/graduate`)).data)?.summary;
  ok("재호출 = 같은 요약", grad2?.graduatedAt === grad?.graduatedAt);
  const runGrad = validate("GET /runs/{id} (졸업)", RunSchema, (await call("GET", `/runs/${run.runId}`)).data);
  ok("Run GRADUATED, endedAt, next null", runGrad?.status === "GRADUATED" && !!runGrad.endedAt && runGrad.next === null && !runGrad.canGraduate, runGrad);
  const album1 = validate("GET /runs/album (체험1)", AlbumResponseSchema, (await call("GET", "/runs/album")).data);
  ok("앨범: 졸업생 1 (컴돌이·경제학원론)", album1?.graduated.length === 1 && album1.graduated[0].runId === run.runId && album1.graduated[0].character === "MALE_EASY" && album1.graduated[0].summary?.chapters === 5, album1);
  const curAfter = validate("current (졸업 후)", CurrentRunResponseSchema, (await call("GET", `/runs/current?materialId=${econId}`)).data);
  ok("졸업 후 그 자료 current = null", curAfter?.run === null);
  const after = await gradedSession(ch[0].chapterId, 40);
  created.sessions.push(after);
  ok("졸업 후 새 세션은 연습 모드(runId null)", (await db.session.findUnique({ where: { id: after } }))?.runId === null);

  console.log("\n[game: GAME OVER]");
  await login("usr_demo2");
  const r2 = validate("체험2 current", CurrentRunResponseSchema, (await call("GET", "/runs/current")).data)?.run;
  ok("체험2 시드 Run: KU ♥♡♡ 0/5", r2?.character === "KU_HARD" && r2.lives === 1 && r2.progress.cleared === 0 && r2.progress.total === 5, r2);
  const snapRun = await db.juniorRun.findUnique({ where: { id: r2!.runId }, include: { progress: true } });
  const kuSess = (await call("POST", "/sessions", { chapterId: r2!.progress.chapters[0].chapterId, juniorLevel: "EASY" })).data as { sessionId: string };
  const kuSess2 = (await call("POST", "/sessions", { chapterId: r2!.progress.chapters[1].chapterId })).data as { sessionId: string };
  const kuRow = await db.session.findUnique({ where: { id: kuSess.sessionId } });
  ok("KU Run 세션은 HARD 로 강제", kuRow?.juniorLevel === "HARD" && kuRow.runId === r2!.runId, kuRow);
  for (const [sid, sc] of [[kuSess.sessionId, 58], [kuSess2.sessionId, 95]] as const) {
    await db.session.update({ where: { id: sid }, data: { status: "RESULT_READY", score: sc } });
  }
  const go = validate("life → GAME OVER", ApplyLifeResponseSchema, (await call("POST", `/runs/${r2!.runId}/life`, { sessionId: kuSess.sessionId })).data);
  ok("58점 < 80 → ♥1→0, GAME_OVER", go?.outcome === "FAILED" && go.livesAfter === 0 && go.runStatus === "GAME_OVER" && !go.canGraduate, go);
  const runGo = await db.juniorRun.findUnique({ where: { id: r2!.runId } });
  ok("Run GAME_OVER + endedAt + summaryJson", runGo?.status === "GAME_OVER" && !!runGo.endedAt && !!runGo.summaryJson, runGo);
  const leftover = validate("life (게임오버 뒤 남은 세션)", ApplyLifeResponseSchema, (await call("POST", `/runs/${r2!.runId}/life`, { sessionId: kuSess2.sessionId })).data);
  ok("게임오버 뒤 남은 세션: applied false, NONE, GAME_OVER", leftover?.applied === false && leftover.outcome === "NONE" && leftover.runStatus === "GAME_OVER" && leftover.livesAfter === 0, leftover);
  const curGo = validate("current (게임오버 후)", CurrentRunResponseSchema, (await call("GET", "/runs/current")).data);
  ok("게임오버 후 current = null", curGo?.run === null);
  expectError("graduate (GAME_OVER)", await call("POST", `/runs/${r2!.runId}/graduate`), 409, "NOT_READY");
  const reborn = await call("POST", "/runs", { materialId: r2!.materialId, character: "FEMALE_NORMAL" });
  const rebornRun = validate("게임오버 뒤 새 Run", RunSchema, reborn.data);
  ok("새 후배는 진행도 0부터, 컴순이 합격선 70", reborn.status === 201 && rebornRun?.progress.cleared === 0 && rebornRun.passScore === 70 && rebornRun.lives === 3, rebornRun);
  const matKeep = await db.chapter.count({ where: { materialId: r2!.materialId } });
  ok("게임오버 후 자료·챕터 유지", matKeep === 5);
  const album2 = validate("GET /runs/album (체험2)", AlbumResponseSchema, (await call("GET", "/runs/album")).data);
  ok("앨범: 떠나간 후배 1 (KU, 요약 포함), 졸업생 0", album2?.departed.length === 1 && album2.departed[0].runId === r2!.runId && album2.departed[0].summary?.finalLives === 0 && album2.graduated.length === 0, album2);

  /* 정리: 시드 상태로 되돌린다 */
  await db.session.deleteMany({ where: { id: { in: [...created.sessions, kuSess.sessionId, kuSess2.sessionId] } } });
  await db.lifeEvent.deleteMany({ where: { sessionId: { in: [...created.sessions, kuSess.sessionId, kuSess2.sessionId] } } });
  await db.juniorRun.deleteMany({ where: { id: { in: [...created.runs, rebornRun!.runId] } } });
  await db.juniorRun.update({ where: { id: snapRun!.id }, data: { status: snapRun!.status, lives: snapRun!.lives, endedAt: null, summaryJson: null } });
  for (const p of snapRun!.progress) {
    await db.chapterProgress.update({ where: { runId_chapterId: { runId: p.runId, chapterId: p.chapterId } }, data: { attempts: p.attempts, bestScore: p.bestScore, cleared: p.cleared, clearedAt: p.clearedAt } });
  }
  const restored = validate("체험2 복원", CurrentRunResponseSchema, (await call("GET", "/runs/current")).data);
  ok("체험2 ♥♡♡ 복원", restored?.run?.lives === 1 && restored.run.runId === r2!.runId, restored?.run);
  await login("usr_demo1");
}

main().catch(async (e) => {
  console.error("smoke crashed:", e);
  await db.$disconnect();
  process.exit(1);
});
