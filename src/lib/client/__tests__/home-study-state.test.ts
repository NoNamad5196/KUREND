import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunDto } from "@/contracts/game";
import type { HomeDto, HomeMaterialDto, HomeResumeDto } from "@/contracts/types";
import { homeStudyState, runStudyState } from "../home-study-state";

function makeResume(status: HomeResumeDto["status"] = "EXPLAINING", sessionId = "sess_current"): HomeResumeDto {
  return { sessionId, chapterTitle: "수요량의 변화", status, stageLabel: "학습 진행 중" };
}

function makeMaterial(materialId = "mat_current", resume: HomeResumeDto | null = null): HomeMaterialDto {
  return { materialId, title: "수요와 공급", chapterCount: 2, taughtCount: 1, resume };
}

function makeHome(materials: HomeMaterialDto[] = []): HomeDto {
  return {
    userName: "학습 선배",
    courses: materials.length ? [{ courseName: "경제학원론", examDate: null, dDay: null, materials }] : [],
    recentSessions: [],
    stats: { completedSessions: 0, averageScore: null, streakDays: 0 },
  };
}

function makeRun(overrides: Partial<RunDto> = {}): RunDto {
  return {
    runId: "run_current",
    materialId: "mat_current",
    materialTitle: "수요와 공급",
    courseName: "경제학원론",
    character: "MALE_EASY",
    lives: 3,
    maxLives: 3,
    passScore: 60,
    examFormat: "OBJECTIVE",
    status: "ACTIVE",
    startedAt: "2026-10-02T00:00:00.000Z",
    endedAt: null,
    progress: {
      cleared: 1,
      total: 2,
      chapters: [
        { chapterId: "chapter_cleared", title: "수요 법칙", order: 0, attempts: 1, bestScore: 100, cleared: true },
        { chapterId: "chapter_next", title: "수요량의 변화", order: 1, attempts: 0, bestScore: null, cleared: false },
      ],
    },
    next: { chapterId: "chapter_next", title: "수요량의 변화" },
    finalExam: { status: "LOCKED", sessionId: null, bestScore: null, attempts: 0, questionCount: 10 },
    canGraduate: false,
    ...overrides,
  };
}

test("an unresolved run stays loading even when home already contains an available lesson", () => {
  const home = makeHome([makeMaterial("mat_current", makeResume())]);
  assert.deepEqual(homeStudyState(home, undefined), { kind: "loading" });
  assert.deepEqual(homeStudyState(home, null), { kind: "new", href: "/materials/mat_current/junior" });
});

test("a new user without materials starts at upload, including an empty course group", () => {
  const home = makeHome();
  assert.deepEqual(homeStudyState(home, null), { kind: "new", href: "/new" });
  home.courses.push({ courseName: "새 과목", examDate: null, dDay: null, materials: [] });
  assert.deepEqual(homeStudyState(home, null), { kind: "new", href: "/new" });
});

test("meeting a junior prefers a material with chapters over an earlier unfinished upload", () => {
  const pending = { ...makeMaterial("mat_pending"), chapterCount: 0, taughtCount: 0 };
  const ready = makeMaterial("mat_ready");
  assert.deepEqual(homeStudyState(makeHome([pending, ready]), null), { kind: "new", href: "/materials/mat_ready/junior" });
  assert.deepEqual(homeStudyState(makeHome([pending]), null), { kind: "new", href: "/materials/mat_pending/junior" });
});

test("the current junior resumes its own material even when another course appears first", () => {
  const currentResume = makeResume("REVIEWING", "sess_current_review");
  const home = makeHome([makeMaterial("mat_other", makeResume("EXAM_IN_PROGRESS", "sess_other_exam"))]);
  home.courses.push({
    courseName: "현재 후배의 과목", examDate: null, dDay: null,
    materials: [makeMaterial("mat_current", currentResume)],
  });
  assert.deepEqual(homeStudyState(home, makeRun()), {
    kind: "resume", resume: currentResume, href: "/session/sess_current_review/review", label: "되짚기 이어하기",
  });
});

test("a different material's open session never replaces the current junior's next lesson", () => {
  const other = makeMaterial("mat_other", makeResume("EXAM_IN_PROGRESS", "sess_other_exam"));
  for (const materials of [[other], [other, makeMaterial()]]) {
    assert.deepEqual(homeStudyState(makeHome(materials), makeRun()), {
      kind: "next", chapterTitle: "수요량의 변화", href: "/materials/mat_current/study/chapter_next", label: "다음 목차 공부하기",
    });
  }
});

const resumeCases: Array<{ status: HomeResumeDto["status"]; path: string; label: string }> = [
  { status: "PREPARING", path: "prepare", label: "수업 준비 이어하기" },
  { status: "EXPLAINING", path: "teach", label: "가르치기 이어하기" },
  { status: "EXAM_IN_PROGRESS", path: "exam", label: "시험 이어보기" },
  { status: "EVALUATING", path: "result", label: "채점 확인" },
  { status: "RESULT_READY", path: "result", label: "결과 보기" },
  { status: "REVIEWING", path: "review", label: "되짚기 이어하기" },
];

for (const { status, path, label } of resumeCases) {
  test(`a ${status} session resumes the correct learning stage instead of starting the next chapter`, () => {
    const resume = makeResume(status);
    assert.deepEqual(homeStudyState(makeHome([makeMaterial("mat_current", resume)]), makeRun()), {
      kind: "resume", resume, href: `/session/sess_current/${path}`, label,
    });
  });
}

for (const status of ["COMPLETED", "FAILED"] as const) {
  test(`a ${status} chapter cannot become the hero's resume destination`, () => {
    const home = makeHome([makeMaterial("mat_current", makeResume(status))]);
    assert.deepEqual(homeStudyState(home, makeRun()), {
      kind: "next", chapterTitle: "수요량의 변화", href: "/materials/mat_current/study/chapter_next", label: "다음 목차 공부하기",
    });
    assert.deepEqual(homeStudyState(home, makeRun({ next: null })), {
      kind: "material", href: "/materials/mat_current", label: "자료 보기",
    });
  });
}

for (const status of ["READY", "IN_PROGRESS", "PASSED"] as const) {
  test(`a ${status} final exam keeps its existing final action ahead of chapter resume`, () => {
    const run = makeRun({
      next: null,
      progress: { cleared: 2, total: 2, chapters: makeRun().progress.chapters.map(chapter => ({ ...chapter, cleared: true })) },
      finalExam: {
        status, sessionId: status === "READY" ? null : "sess_final",
        bestScore: status === "PASSED" ? 100 : null,
        attempts: status === "PASSED" ? 1 : 0, questionCount: 10,
      },
      canGraduate: status === "PASSED",
    });
    const home = makeHome([makeMaterial("mat_current", makeResume("REVIEWING"))]);
    assert.deepEqual(homeStudyState(home, run), { kind: "final" });
    assert.deepEqual(runStudyState(run), { kind: "final" });
  });
}

test("an explicit graduation eligibility flag preserves the final action even with an older final-status snapshot", () => {
  assert.deepEqual(runStudyState(makeRun({ canGraduate: true }), makeResume()), { kind: "final" });
});

test("without a saved session the existing next-study route and chapter title remain available", () => {
  const run = makeRun({ materialId: "mat with space", next: { chapterId: "chapter/next", title: "다음 학습 목표" } });
  assert.deepEqual(runStudyState(run, null), {
    kind: "next", chapterTitle: "다음 학습 목표", href: "/materials/mat%20with%20space/study/chapter%2Fnext", label: "다음 목차 공부하기",
  });
});

test("a run with neither a resumable session nor a next chapter safely opens its own material", () => {
  assert.deepEqual(runStudyState(makeRun({ next: null })), {
    kind: "material", href: "/materials/mat_current", label: "자료 보기",
  });
});

for (const status of ["GAME_OVER", "GRADUATED"] as const) {
  test(`a ${status} junior retains the new-junior action even when old study or final data remains`, () => {
    const run = makeRun({
      status, endedAt: "2026-10-02T01:00:00.000Z", next: null,
      finalExam: { status: "PASSED", sessionId: "sess_old_final", bestScore: 100, attempts: 1, questionCount: 10 },
    });
    assert.deepEqual(homeStudyState(makeHome([makeMaterial("mat_current", makeResume())]), run), {
      kind: "ended", href: "/materials/mat_current/junior", label: "새 후배 만나기",
    });
  });
}
