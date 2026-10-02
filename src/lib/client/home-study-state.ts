import type { RunDto } from "@/contracts/game";
import type { HomeDto, HomeResumeDto } from "@/contracts/types";
import { routeForSession } from "./api";

export type RunStudyState =
  | { kind: "final" }
  | { kind: "resume"; resume: HomeResumeDto; href: string; label: string }
  | { kind: "next"; chapterTitle: string; href: string; label: string }
  | { kind: "material" | "ended"; href: string; label: string };

export type HomeStudyState = RunStudyState
  | { kind: "loading" }
  | { kind: "new"; href: string };

/** Final exams keep their own action; a completed chapter is never a resume target. */
export function runStudyState(run: RunDto, resume?: HomeResumeDto | null): RunStudyState {
  const material = `/materials/${encodeURIComponent(run.materialId)}`;
  if (run.status !== "ACTIVE") return { kind: "ended", href: `${material}/junior`, label: "새 후배 만나기" };
  if (run.canGraduate || run.finalExam.status !== "LOCKED") return { kind: "final" };
  if (resume && resume.status !== "COMPLETED" && resume.status !== "FAILED") {
    const labels: Partial<Record<HomeResumeDto["status"], string>> = {
      PREPARING: "수업 준비 이어하기",
      EXPLAINING: "가르치기 이어하기",
      EXAM_IN_PROGRESS: "시험 이어보기",
      EVALUATING: "채점 확인",
      RESULT_READY: "결과 보기",
      REVIEWING: "되짚기 이어하기",
    };
    return { kind: "resume", resume, href: routeForSession(resume), label: labels[resume.status] ?? "이어하기" };
  }
  if (run.next) return {
    kind: "next", chapterTitle: run.next.title,
    href: `${material}/study/${encodeURIComponent(run.next.chapterId)}`, label: "다음 목차 공부하기",
  };
  return { kind: "material", href: material, label: "자료 보기" };
}

export function homeStudyState(home: HomeDto, run: RunDto | null | undefined): HomeStudyState {
  if (run === undefined) return { kind: "loading" };
  const materials = home.courses.flatMap((course) => course.materials);
  if (!run) {
    const material = materials.find((item) => item.chapterCount > 0) ?? materials[0];
    return { kind: "new", href: material ? `/materials/${encodeURIComponent(material.materialId)}/junior` : "/new" };
  }
  // The home API already filters each material's resume to its active run.
  // Never borrow the first session of a different material/course.
  return runStudyState(run, materials.find((material) => material.materialId === run.materialId)?.resume);
}
