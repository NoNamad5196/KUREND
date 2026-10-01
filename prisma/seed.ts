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

async function main() {
  console.log(`seed: data dir = ${DATA_DIR}`);
  const materials = readJson<SeedMaterial[]>("materials.json");
  const sessions = existsSync(resolve(DATA_DIR, "sessions.json")) ? readJson<SeedSessions>("sessions.json") : {};

  await wipe();

  for (const [i, u] of DEMO_USERS.entries()) {
    await db.user.create({ data: { ...u, createdAt: daysFromNow(-7, 9 + i) } });
  }
  console.log(`  users: ${DEMO_USERS.map((u) => u.id).join(", ")}`);

  const demo = DEMO_USERS[0].id;
  const seeded = new Map<string, SeededMaterial>();
  for (const [i, m] of materials.entries()) {
    const sm = await seedMaterial(demo, m, daysFromNow(-3, 10 + i));
    seeded.set(m.slug, sm);
    console.log(`  material ${sm.id} "${m.title}" (${m.courseName}) chapters=${m.chapters.length} chars=${sm.text.length}`);
  }

  if (sessions.completed) {
    const id = await seedCompletedSession(demo, seeded, sessions.completed);
    console.log(`  completed session ${id} score=${sessions.completed.score} gaps=${sessions.completed.gaps.length}`);
  }
  if (sessions.inProgress) {
    const id = await seedInProgressSession(demo, seeded, sessions.inProgress);
    console.log(`  in-progress session ${id} (EXPLAINING)`);
  }
  console.log("seed: done");
}

main()
  .catch((e) => {
    console.error("seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
