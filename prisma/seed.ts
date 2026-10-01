/**
 * [C 소유] 시드 (§3-1). `pnpm db:seed` / `pnpm db:reset`
 *
 *  - 데모 계정 3개: usr_demo1(체험 1), usr_demo2(체험 2), usr_demo3(체험 3)
 *  - usr_demo1 에 READY 자료 2개(운영체제 / 경제학원론) + 완료 세션 1개(94점, 놓친 곳 1개) + 진행 중 세션 1개
 *  - 데이터 원본: prisma/seed-data/{materials.json, sessions.json, *.md}
 *    D 가 fixtures/seed-data/ 에 같은 형식을 두면 그쪽을 우선한다 (SEED_DATA_DIR 로 강제 지정 가능).
 *  - 멱등: 실행할 때마다 전체 테이블을 비우고 다시 넣는다.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/lib/server/db";
import { normalizeText } from "@/lib/server/ingest";
import { newId, examItemId } from "@/lib/server/ids";
import { CHARACTERS, lifeOutcomeFor, pointsPlan, type JuniorCharacter } from "@/contracts/game";

/* ───────── 입력 형식 ───────── */
type SeedChapter = { title: string; points: string[]; startPara: number; endPara: number };
type SeedMaterial = {
  slug: string;
  file: string;
  courseName: string;
  title: string;
  fileName?: string;
  examDateOffsetDays?: number | null;
  chapters: SeedChapter[];
};
type SeedMessage = { role: "USER" | "JUNIOR"; stage: "QUESTION" | "ANSWER" | "REACTION" | "DOUBT"; content: string };
type SeedQuestion = { qid: string; order: number; points: number; question: string; objectiveRef: string; rubric: string };
type SeedSentence = { sentence: string; ref: number | null; level: "STRONG" | "FAINT" | "NONE"; unlearned: boolean };
type SeedSessionBase = {
  materialSlug: string;
  chapterIndex: number;
  juniorLevel?: "EASY" | "HARD";
  objectives: { id: string; text: string }[];
  heardConcepts: string[];
  messages: SeedMessage[];
  questions: SeedQuestion[];
};
type SeedCompleted = SeedSessionBase & {
  score: number;
  finalVerdict: "NEEDS_WORK" | "MOSTLY" | "STABLE";
  answers: { qid: string; answer: string; sentences: SeedSentence[] }[];
  grades: { qid: string; score: number; maxScore: number; verdict: "CORRECT" | "PARTIAL" | "WRONG"; comment: string }[];
  gaps: {
    qid: string;
    title: string;
    diagnosis: string;
    evidenceQuote: string;
    concepts: string[];
    sourceExcerpt: string;
    tutorMessages?: { request: string; response: string }[];
  }[];
};
type SeedSessions = { completed?: SeedCompleted; inProgress?: SeedSessionBase };

/* ───────── 경로 ───────── */
const ROOT = process.cwd();
const CANDIDATES = [process.env.SEED_DATA_DIR, "fixtures/seed-data", "prisma/seed-data"].filter(Boolean) as string[];
const DATA_DIR: string = (() => {
  const found = CANDIDATES.map((d) => resolve(ROOT, d)).find((d) => existsSync(resolve(d, "materials.json")));
  if (!found) throw new Error(`seed-data 디렉터리를 찾을 수 없습니다: ${CANDIDATES.join(", ")}`);
  return found;
})();

const readJson = <T>(name: string): T => JSON.parse(readFileSync(resolve(DATA_DIR, name), "utf8")) as T;

/* ───────── 유틸 ───────── */
const DEMO_USERS = [
  { id: "usr_demo1", nickname: "체험 1" },
  { id: "usr_demo2", nickname: "체험 2" },
  { id: "usr_demo3", nickname: "체험 3" },
];

function daysFromNow(days: number, hour = 0): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/** 빈 줄(2줄 이상)로 나뉜 문단의 [start, end) 오프셋 목록 */
function paragraphRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const re = /\n{2,}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) ranges.push({ start: last, end: m.index });
    last = m.index + m[0].length;
  }
  if (last < text.length) ranges.push({ start: last, end: text.length });
  return ranges;
}

/** 메시지 createdAt 을 1분 간격으로 늘려 정렬이 안정적이게 한다 */
function stamp(base: Date, i: number, stepMs = 60_000): Date {
  return new Date(base.getTime() + i * stepMs);
}

/* ───────── 메인 ───────── */
async function wipe() {
  // [게임 확장] 게임 테이블 먼저
  await db.wrongNote.deleteMany();
  await db.teacherNote.deleteMany();
  await db.conceptMastery.deleteMany();
  await db.lifeEvent.deleteMany();
  await db.chapterProgress.deleteMany();
  await db.session.updateMany({ data: { runId: null } });
  await db.juniorRun.deleteMany();
  await db.tutorMessage.deleteMany();
  await db.gap.deleteMany();
  await db.grade.deleteMany();
  await db.examAnswer.deleteMany();
  await db.examQuestion.deleteMany();
  await db.exam.deleteMany();
  await db.message.deleteMany();
  await db.session.deleteMany();
  await db.chapter.deleteMany();
  await db.source.deleteMany();
  await db.material.deleteMany();
  await db.user.deleteMany();
}

type SeededMaterial = { id: string; sourceId: string; text: string; chapterIds: string[]; chapterRanges: Array<{ start: number; end: number }> };

async function seedMaterial(userId: string, m: SeedMaterial, createdAt: Date): Promise<SeededMaterial> {
  const raw = readFileSync(resolve(DATA_DIR, m.file), "utf8");
  const text = normalizeText(raw);
  const paras = paragraphRanges(text);

  const chapterRanges = m.chapters.map((c, i) => {
    const s = paras[c.startPara];
    const e = paras[c.endPara];
    if (!s || !e) throw new Error(`${m.slug} chapter ${i} 의 문단 범위가 잘못됨 (${c.startPara}~${c.endPara}, 문단 ${paras.length}개)`);
    return { start: s.start, end: e.end };
  });

  const materialId = newId("mat");
  const sourceId = newId("src");
  const chapterIds = m.chapters.map(() => newId("chp"));

  await db.material.create({
    data: {
      id: materialId,
      userId,
      courseName: m.courseName,
      examDate: typeof m.examDateOffsetDays === "number" ? daysFromNow(m.examDateOffsetDays) : null,
      title: m.title,
      status: "READY",
      createdAt,
      sources: {
        create: { id: sourceId, kind: "MD", fileName: m.fileName ?? m.file, text, charCount: text.length },
      },
    },
  });
  for (let i = 0; i < m.chapters.length; i++) {
    const c = m.chapters[i];
    await db.chapter.create({
      data: {
        id: chapterIds[i],
        materialId,
        order: i + 1,
        title: c.title,
        pointsJson: JSON.stringify(c.points),
        sourceId,
        startOffset: chapterRanges[i].start,
        endOffset: chapterRanges[i].end,
      },
    });
  }
  return { id: materialId, sourceId, text, chapterIds, chapterRanges };
}

async function seedCompletedSession(userId: string, mats: Map<string, SeededMaterial>, s: SeedCompleted) {
  const mat = mats.get(s.materialSlug);
  if (!mat) throw new Error(`sessions.json completed: 자료 slug 없음 ${s.materialSlug}`);
  const chapterId = mat.chapterIds[s.chapterIndex];
  if (!chapterId) throw new Error(`sessions.json completed: chapterIndex 범위 밖 ${s.chapterIndex}`);

  const completedAt = daysFromNow(-1, 21); // 어제 21:00 → 연속 학습일 1
  const createdAt = new Date(completedAt.getTime() - 40 * 60_000);
  const sessionId = newId("sess");
  const examId = newId("exam");

  await db.session.create({
    data: {
      id: sessionId,
      userId,
      chapterId,
      status: "COMPLETED",
      phase: "EXAM_READY",
      juniorLevel: s.juniorLevel ?? "EASY",
      objectivesJson: JSON.stringify(s.objectives),
      heardJson: JSON.stringify(s.heardConcepts),
      score: s.score,
      finalVerdict: s.finalVerdict,
      createdAt,
      updatedAt: completedAt,
      completedAt,
      messages: {
        create: s.messages.map((msg, i) => ({
          id: newId("msg"),
          role: msg.role,
          stage: msg.stage,
          content: msg.content,
          createdAt: stamp(createdAt, i + 1),
        })),
      },
      exam: {
        create: {
          id: examId,
          status: "GRADED",
          createdAt,
          questions: {
            create: s.questions.map((q) => ({
              id: examItemId(examId, q.qid),
              qid: q.qid,
              order: q.order,
              points: q.points,
              question: q.question,
              objectiveRef: q.objectiveRef,
              rubric: q.rubric,
            })),
          },
          answers: {
            create: s.answers.map((a, i) => ({
              id: examItemId(examId, a.qid),
              qid: a.qid,
              answer: a.answer,
              sentencesJson: JSON.stringify(a.sentences),
              createdAt: stamp(completedAt, -10 + i),
            })),
          },
          grades: {
            create: s.grades.map((g) => ({
              id: examItemId(examId, g.qid),
              qid: g.qid,
              score: g.score,
              maxScore: g.maxScore,
              verdict: g.verdict,
              comment: g.comment,
            })),
          },
        },
      },
    },
  });

  for (let i = 0; i < s.gaps.length; i++) {
    const g = s.gaps[i];
    const gapId = newId("gap");
    const idx = mat.text.indexOf(g.sourceExcerpt);
    await db.gap.create({
      data: {
        id: gapId,
        sessionId,
        qid: g.qid,
        title: g.title,
        diagnosis: g.diagnosis,
        evidenceQuote: g.evidenceQuote,
        conceptsJson: JSON.stringify(g.concepts),
        sourceExcerpt: g.sourceExcerpt,
        sourceOffset: idx >= 0 ? idx : null,
        status: "FOUND",
        createdAt: stamp(completedAt, -5 + i),
        tutorMessages: {
          create: (g.tutorMessages ?? []).map((t, j) => ({
            id: newId("tm"),
            sessionId,
            request: t.request,
            response: t.response,
            createdAt: stamp(completedAt, -3 + j),
          })),
        },
      },
    });
    if (idx < 0) console.warn(`  ! gap "${g.title}" 의 sourceExcerpt 가 자료 본문에 없음 (sourceOffset=null)`);
  }

  // 완료된 세션이 있는 챕터는 "가르침" 달성. 놓친 곳이 0개일 때만 "안정".
  await db.chapter.update({
    where: { id: chapterId },
    data: { taughtAt: completedAt, ...(s.gaps.length === 0 ? { stableAt: completedAt } : {}) },
  });
  return sessionId;
}

async function seedInProgressSession(userId: string, mats: Map<string, SeededMaterial>, s: SeedSessionBase) {
  const mat = mats.get(s.materialSlug);
  if (!mat) throw new Error(`sessions.json inProgress: 자료 slug 없음 ${s.materialSlug}`);
  const chapterId = mat.chapterIds[s.chapterIndex];
  if (!chapterId) throw new Error(`sessions.json inProgress: chapterIndex 범위 밖 ${s.chapterIndex}`);

  const updatedAt = new Date(Date.now() - 60 * 60_000); // 1시간 전
  const createdAt = new Date(updatedAt.getTime() - 10 * 60_000);
  const sessionId = newId("sess");
  const examId = newId("exam");

  await db.session.create({
    data: {
      id: sessionId,
      userId,
      chapterId,
      status: "EXPLAINING",
      phase: "QUESTION",
      juniorLevel: s.juniorLevel ?? "EASY",
      objectivesJson: JSON.stringify(s.objectives),
      heardJson: JSON.stringify(s.heardConcepts),
      createdAt,
      updatedAt,
      messages: {
        create: s.messages.map((msg, i) => ({
          id: newId("msg"),
          role: msg.role,
          stage: msg.stage,
          content: msg.content,
          createdAt: stamp(createdAt, i + 1),
        })),
      },
      exam: {
        create: {
          id: examId,
          status: "READY",
          createdAt,
          questions: {
            create: s.questions.map((q) => ({
              id: examItemId(examId, q.qid),
              qid: q.qid,
              order: q.order,
              points: q.points,
              question: q.question,
              objectiveRef: q.objectiveRef,
              rubric: q.rubric,
            })),
          },
        },
      },
    },
  });
  return sessionId;
}

/* ───────── [① 게임 코어] Run · LIFE · 강의노트 시드 ───────── */
type SeedRunHistory = { chapterIndex: number; score: number; daysAgo: number; sessionId?: string };
type SeedRun = {
  key: string;
  userId: string;
  materialSlug: string;
  character: JuniorCharacter;
  maxLives: number;
  startedDaysAgo: number;
  linkSeedSessions?: boolean;
  /** true 면 history 의 합성 세션을 실제 완료 세션으로 만든다 */
  historySessions?: boolean;
  history: SeedRunHistory[];
};
type SeedRuns = { runs: SeedRun[]; extraMaterials?: { userId: string; materialSlug: string }[] };

/** 받침에 따라 을/를 */
const eul = (w: string) => { const c = w.trim().charCodeAt(w.trim().length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? `${w}을` : c >= 0 && c <= 11171 ? `${w}를` : `${w}을(를)`; };
type SeedNote = { mustTeach: string[]; keyTakeaways: string[]; confusing: string[]; likelyQuestions: string[] };
const NOTE_FILES: Record<string, string> = { "os-scheduling": "teacher-notes.os.json", "econ-supply-demand": "teacher-notes.econ.json" };
function loadNotes(slug: string): Record<string, SeedNote> {
  const file = resolve(ROOT, "src/lib/llm/fixtures", NOTE_FILES[slug] ?? "");
  return NOTE_FILES[slug] && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

/**
 * Run 기록(history)의 지난 시험을 실제 완료 세션으로 남긴다: 선배 설명 1개 + 후배 문항 수만큼의 채점.
 * 홈 통계·내 세션·오답노트와 Run 진행도가 어긋나지 않고, 졸업시험이 "지금까지 가르친 설명"을 옮겨 담을 수 있다.
 */
async function seedHistorySession(input: {
  sessionId: string; userId: string; runId: string; character: JuniorCharacter; chapterId: string;
  chapterTitle: string; note: SeedNote | undefined; score: number; at: Date;
}) {
  const spec = CHARACTERS[input.character];
  const note = input.note ?? { mustTeach: [input.chapterTitle], keyTakeaways: [`${input.chapterTitle}의 핵심을 설명했다.`], confusing: [], likelyQuestions: [] };
  const explanation = [...note.keyTakeaways, ...note.mustTeach.map((m) => `${m}도 중요해.`)].join(" ").slice(0, 1800);
  const asks = [...note.likelyQuestions, ...note.mustTeach.map((m) => `${eul(m)} 설명하세요.`), ...note.confusing.map((c) => `${c} 이 점을 설명하세요.`)];
  const plan = pointsPlan(spec.questionCount);
  let left = input.score;
  const items = plan.map((points, i) => {
    const got = Math.max(0, Math.min(points, left));
    left -= got;
    const verdict = got === points ? "CORRECT" : got > 0 ? "PARTIAL" : "WRONG";
    return { qid: `q${i + 1}`, order: i + 1, points, got, verdict, question: asks[i % Math.max(1, asks.length)] ?? `${eul(input.chapterTitle)} 설명하세요.` };
  });
  const examId = newId("exam");
  const t = (min: number) => new Date(input.at.getTime() + min * 60_000);
  await db.session.create({
    data: {
      id: input.sessionId, userId: input.userId, chapterId: input.chapterId, runId: input.runId,
      status: "COMPLETED", phase: "EXAM_READY", juniorLevel: spec.level,
      objectivesJson: JSON.stringify(note.mustTeach.slice(0, 3).map((text, i) => ({ id: `o${i + 1}`, text: `${eul(text)} 설명할 수 있다`, covered: true }))),
      heardJson: JSON.stringify(note.mustTeach.slice(0, 6)),
      score: input.score, finalVerdict: input.score >= 90 ? "STABLE" : input.score >= 70 ? "MOSTLY" : "NEEDS_WORK",
      createdAt: input.at, updatedAt: t(30), completedAt: t(30),
      messages: { create: [
        { id: newId("msg"), role: "JUNIOR", stage: "QUESTION", content: `선배, ${input.chapterTitle}부터 알려줄래?`, createdAt: t(0) },
        { id: newId("msg"), role: "USER", stage: "ANSWER", content: explanation, createdAt: t(3) },
        { id: newId("msg"), role: "JUNIOR", stage: "REACTION", content: "아하, 이제 좀 알 것 같아요!", createdAt: t(4) },
      ] },
      exam: { create: {
        id: examId, status: "GRADED", format: spec.examFormat, createdAt: t(10),
        questions: { create: items.map((q) => ({ id: examItemId(examId, q.qid), qid: q.qid, order: q.order, points: q.points, question: q.question, objectiveRef: `o${(q.order - 1) % 3 + 1}`, rubric: "핵심 개념;근거" })) },
        answers: { create: items.map((q) => ({ id: examItemId(examId, q.qid), qid: q.qid, answer: q.verdict === "WRONG" ? "이 부분은 선배한테 못 들어서 모르겠습니다." : explanation.slice(0, 160), sentencesJson: "[]" })) },
        grades: { create: items.map((q) => ({ id: examItemId(examId, q.qid), qid: q.qid, score: q.got, maxScore: q.points, verdict: q.verdict,
          comment: q.verdict === "CORRECT" ? "자료의 채점 요소를 모두 설명했습니다." : q.verdict === "PARTIAL" ? "일부 요소가 빠졌습니다." : "선배의 설명에서 찾지 못했습니다." })) },
      } },
    },
  });
}

async function seedGame(
  materials: SeedMaterial[],
  demoMaterials: Map<string, SeededMaterial>,
  seedSessions: { completedId: string | null; inProgressId: string | null },
) {
  if (!existsSync(resolve(DATA_DIR, "runs.json"))) return;
  const cfg = readJson<SeedRuns>("runs.json");
  const bySlug = new Map(materials.map((m) => [m.slug, m]));
  // 사용자별 자료: 체험1 은 위에서 만든 자료, 체험2·3 은 같은 원본으로 별도 자료를 만든다.
  const owned = new Map<string, SeededMaterial>();
  for (const [slug, sm] of demoMaterials) owned.set(`${DEMO_USERS[0].id}:${slug}`, sm);
  for (const [i, x] of (cfg.extraMaterials ?? []).entries()) {
    const m = bySlug.get(x.materialSlug);
    if (!m) throw new Error(`runs.json extraMaterials: 자료 slug 없음 ${x.materialSlug}`);
    const sm = await seedMaterial(x.userId, m, daysFromNow(-10, 9 + i));
    owned.set(`${x.userId}:${x.materialSlug}`, sm);
    console.log(`  material ${sm.id} "${m.title}" → ${x.userId}`);
  }

  for (const r of cfg.runs) {
    const mat = owned.get(`${r.userId}:${r.materialSlug}`);
    if (!mat) throw new Error(`runs.json ${r.key}: ${r.userId} 의 ${r.materialSlug} 자료가 없음`);
    const spec = CHARACTERS[r.character];
    const runId = newId("run");
    const startedAt = daysFromNow(-r.startedDaysAgo, 10);
    let lives = r.maxLives;
    const best = new Map<number, number>();
    const attempts = new Map<number, number>();
    const clearedAt = new Map<number, Date>();
    const events: Array<Record<string, unknown>> = [];
    const notes = loadNotes(r.materialSlug);
    const pending: Parameters<typeof seedHistorySession>[0][] = [];

    for (const [i, h] of r.history.entries()) {
      const createdAt = daysFromNow(-h.daysAgo, 20 + (i % 3));
      const { outcome } = lifeOutcomeFor({ score: h.score, passScore: spec.passScore, lives, maxLives: r.maxLives });
      const before = lives;
      lives = Math.max(0, Math.min(r.maxLives, lives + lifeOutcomeFor({ score: h.score, passScore: spec.passScore, lives, maxLives: r.maxLives }).delta));
      const sessionId = h.sessionId === "completed" ? seedSessions.completedId : `sess_seed_${r.key}_${i + 1}`;
      if (!sessionId) throw new Error(`runs.json ${r.key}: 완료 세션이 시드되지 않음`);
      if (r.historySessions && h.sessionId !== "completed") {
        const m = bySlug.get(r.materialSlug)!;
        pending.push({ sessionId, userId: r.userId, runId, character: r.character, chapterId: mat.chapterIds[h.chapterIndex],
          chapterTitle: m.chapters[h.chapterIndex].title, note: notes[m.chapters[h.chapterIndex].title], score: h.score, at: createdAt });
      }
      events.push({
        id: newId("lev"), runId, sessionId, chapterId: mat.chapterIds[h.chapterIndex], outcome, delta: lives - before,
        livesBefore: before, livesAfter: lives, score: h.score, passScore: spec.passScore, createdAt,
      });
      attempts.set(h.chapterIndex, (attempts.get(h.chapterIndex) ?? 0) + 1);
      best.set(h.chapterIndex, Math.max(best.get(h.chapterIndex) ?? -1, h.score));
      if (h.score >= spec.passScore && !clearedAt.has(h.chapterIndex)) clearedAt.set(h.chapterIndex, createdAt);
    }

    await db.juniorRun.create({
      data: {
        id: runId, userId: r.userId, materialId: mat.id, character: r.character, lives, maxLives: r.maxLives, status: "ACTIVE", startedAt,
        progress: {
          create: mat.chapterIds.map((chapterId, idx) => ({
            chapterId,
            attempts: attempts.get(idx) ?? 0,
            bestScore: best.has(idx) ? best.get(idx)! : null,
            cleared: clearedAt.has(idx),
            clearedAt: clearedAt.get(idx) ?? null,
          })),
        },
      },
    });
    for (const h of pending) await seedHistorySession(h);
    for (const e of events) await db.lifeEvent.create({ data: e as Parameters<typeof db.lifeEvent.create>[0]["data"] });
    // 통과한 챕터는 "가르침" 기록도 남긴다 (홈의 "목차 n개 중 m개 가르침" 과 Run 진행도가 어긋나지 않게)
    for (const [idx, at] of clearedAt) {
      await db.chapter.updateMany({ where: { id: mat.chapterIds[idx], taughtAt: null }, data: { taughtAt: at } });
    }

    if (r.linkSeedSessions) {
      // 기존 시드 세션을 이 Run 에 연결: 완료 세션은 후배 난이도(HARD)로, 진행 중 세션은 runId 만.
      if (seedSessions.completedId) {
        await db.session.update({ where: { id: seedSessions.completedId }, data: { runId, juniorLevel: spec.level } });
      }
      if (seedSessions.inProgressId) await db.session.update({ where: { id: seedSessions.inProgressId }, data: { runId } });
    }
    const hearts = "♥".repeat(lives) + "♡".repeat(r.maxLives - lives);
    console.log(`  run ${runId} ${r.userId} ${r.character} ${r.materialSlug} ${hearts} cleared ${clearedAt.size}/${mat.chapterIds.length}`);
  }

  await seedTeacherNotes(materials, owned);
}

/** ② 의 강의노트 fixture(챕터 제목 → 노트)를 모든 사용자 자료에 적재. fixture 가 아직 없으면 건너뛴다. */
async function seedTeacherNotes(materials: SeedMaterial[], owned: Map<string, SeededMaterial>) {
  const files: Record<string, string> = { "os-scheduling": "teacher-notes.os.json", "econ-supply-demand": "teacher-notes.econ.json" };
  const dir = resolve(ROOT, "src/lib/llm/fixtures");
  let count = 0;
  for (const [key, sm] of owned) {
    const slug = key.slice(key.indexOf(":") + 1);
    const file = resolve(dir, files[slug] ?? "");
    if (!files[slug] || !existsSync(file)) continue;
    const notes = JSON.parse(readFileSync(file, "utf8")) as Record<string, { mustTeach: string[]; keyTakeaways: string[]; confusing: string[]; likelyQuestions: string[] }>;
    const m = materials.find((x) => x.slug === slug)!;
    for (const [i, c] of m.chapters.entries()) {
      const n = notes[c.title];
      if (!n) {
        console.warn(`  ! 강의노트 fixture 에 "${c.title}" 없음`);
        continue;
      }
      const note = { mustTeach: n.mustTeach, keyTakeaways: n.keyTakeaways, confusing: n.confusing, likelyQuestions: n.likelyQuestions };
      await db.teacherNote.create({ data: { id: newId("tn"), materialId: sm.id, chapterId: sm.chapterIds[i], noteJson: JSON.stringify(note) } });
      count++;
    }
  }
  console.log(count ? `  teacher notes: ${count}` : "  teacher notes: ② fixture 없음 → 건너뜀");
}

async function main() {
  console.log(`seed: data dir = ${DATA_DIR}`);
  const materials = readJson<SeedMaterial[]>("materials.json");
  const sessions = existsSync(resolve(DATA_DIR, "sessions.json")) ? readJson<SeedSessions>("sessions.json") : {};

  await wipe();

  for (const [i, u] of DEMO_USERS.entries()) {
    await db.user.create({ data: { ...u, createdAt: daysFromNow(-7, 9 + i), onboardingCompletedAt: i === 0 ? daysFromNow(-7, 9) : null } });
  }
  console.log(`  users: ${DEMO_USERS.map((u) => u.id).join(", ")}`);

  const demo = DEMO_USERS[0].id;
  const seeded = new Map<string, SeededMaterial>();
  for (const [i, m] of materials.entries()) {
    const sm = await seedMaterial(demo, m, daysFromNow(-3, 10 + i));
    seeded.set(m.slug, sm);
    console.log(`  material ${sm.id} "${m.title}" (${m.courseName}) chapters=${m.chapters.length} chars=${sm.text.length}`);
  }

  let completedId: string | null = null;
  let inProgressId: string | null = null;
  if (sessions.completed) {
    completedId = await seedCompletedSession(demo, seeded, sessions.completed);
    console.log(`  completed session ${completedId} score=${sessions.completed.score} gaps=${sessions.completed.gaps.length}`);
  }
  if (sessions.inProgress) {
    inProgressId = await seedInProgressSession(demo, seeded, sessions.inProgress);
    console.log(`  in-progress session ${inProgressId} (EXPLAINING)`);
  }

  await seedGame(materials, seeded, { completedId, inProgressId });
  console.log("seed: done");
}

main()
  .catch((e) => {
    console.error("seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
