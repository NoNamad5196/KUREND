"use client";
/**
 * [③] 게임 컴포넌트 미리보기 (개발용). 백엔드 없이 fixture props 로 아바타·하트·카드·오버레이·씬을 모두 띄운다.
 * production 빌드에서는 404.
 */
import { notFound } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip } from "@/components/session/ui";
import { CharacterBadge } from "@/components/game/CharacterBadge";
import { JuniorAvatar, type JuniorOutfit, type JuniorView } from "@/components/game/JuniorAvatar";
import { JuniorCard } from "@/components/game/JuniorCard";
import { JuniorSelect } from "@/components/game/JuniorSelect";
import { LifeHearts } from "@/components/game/LifeHearts";
import { ResultOverlay } from "@/components/game/ResultOverlay";
import { TeacherNoteBody, TeacherNoteDrawer } from "@/components/game/TeacherNoteDrawer";
import { GameOverScene } from "@/components/game/scenes/GameOverScene";
import { GraduationScene } from "@/components/game/scenes/GraduationScene";
import { JUNIOR_CHARACTERS, type JuniorCharacter, type LifeResult, type RunSummary } from "@/components/game/types";
import { FINAL_QUESTION_COUNT } from "@/contracts/game";

const VIEWS: JuniorView[] = ["front", "side"];
const OUTFITS: JuniorOutfit[] = ["default", "grad", "soldiers", "casual"];

const RUN: RunSummary = {
  runId: "run_demo", materialId: "mat_demo", materialTitle: "4장 프로세스 스케줄링", courseName: "운영체제", character: "KU_HARD",
  lives: 2, maxLives: 3, passScore: 80, examFormat: "DESCRIPTIVE", status: "ACTIVE", startedAt: "2026-10-01T00:00:00.000Z", endedAt: null,
  progress: { cleared: 5, total: 8, chapters: [] }, next: { chapterId: "chp_x", title: "CPU 스케줄링 알고리즘" }, canGraduate: false,
  finalExam: { status: "LOCKED", sessionId: null, bestScore: null, attempts: 0, questionCount: FINAL_QUESTION_COUNT },
};
const NOTE = {
  chapterId: "chp_x",
  mustTeach: ["CPU Scheduling이 필요한 이유", "FCFS", "SJF", "Round Robin", "Time Quantum", "Context Switching"],
  keyTakeaways: ["FCFS는 먼저 도착한 프로세스부터 처리한다.", "Round Robin은 Time Quantum을 사용한다.", "Time Quantum이 너무 짧으면 Context Switch가 증가한다."],
  confusing: ["FCFS와 Round Robin의 차이", "SJF와 SRTF의 차이"],
  likelyQuestions: ["왜 그냥 먼저 온 프로세스부터 실행하면 안 돼?", "Time Quantum은 짧을수록 좋은 거야?"],
};
function lifeResult(outcome: LifeResult["outcome"], gameOver = false): LifeResult {
  if (outcome === "FAILED") return { applied: true, outcome, score: 54, passScore: 80, livesBefore: gameOver ? 1 : 3, livesAfter: gameOver ? 0 : 2, maxLives: 3, runStatus: gameOver ? "GAME_OVER" : "ACTIVE", chapter: { cleared: false, bestScore: 54, firstClear: false }, canGraduate: false };
  if (outcome === "PERFECT") return { applied: true, outcome, score: 100, passScore: 80, livesBefore: 2, livesAfter: 3, maxLives: 3, runStatus: "ACTIVE", chapter: { cleared: true, bestScore: 100, firstClear: true }, canGraduate: false };
  return { applied: true, outcome: "CLEAR", score: 82, passScore: 80, livesBefore: 3, livesAfter: 3, maxLives: 3, runStatus: "ACTIVE", chapter: { cleared: true, bestScore: 82, firstClear: true }, canGraduate: false };
}

export default function GameDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const [character, setCharacter] = useState<JuniorCharacter>("KU_HARD");
  const [view, setView] = useState<JuniorView>("front");
  const [outfit, setOutfit] = useState<JuniorOutfit | "auto">("auto");
  const [lives, setLives] = useState(3);
  const [overlay, setOverlay] = useState<LifeResult | null>(null);
  const [scene, setScene] = useState<"none" | "over" | "grad">("none");
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="space-y-8 pb-20">
      <header>
        <h1 className="text-2xl font-black">게임 컴포넌트 미리보기</h1>
        <p className="text-sm text-muted">③ 개발용. 백엔드 없이 props 만으로 동작한다.</p>
      </header>

      <Card className="p-5">
        <h2 className="text-lg font-bold">정적 캐릭터 · 의상</h2>
        <div className="mt-4 flex flex-wrap gap-6">
          {JUNIOR_CHARACTERS.map((c) => (
            <button key={c} type="button" onClick={() => setCharacter(c)} className={`rounded-card border p-3 ${character === c ? "border-primary bg-primary-soft" : "border-line"}`}>
              <JuniorAvatar character={c} size={200} view={view} outfit={outfit === "auto" ? undefined : outfit} />
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="w-12 text-muted">view</span>{VIEWS.map((v) => <button key={v} type="button" onClick={() => setView(v)}><Chip tone={view === v ? "primary" : "default"}>{v}</Chip></button>)}
          <span className="ml-4 w-12 text-muted">outfit</span>{(["auto", ...OUTFITS] as const).map((o) => <button key={o} type="button" onClick={() => setOutfit(o)}><Chip tone={outfit === o ? "primary" : "default"}>{o}</Chip></button>)}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-bold">하트 · 배지</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <LifeHearts lives={lives} maxLives={3} size={32} />
          <Button size="sm" variant="secondary" onClick={() => setLives((n) => Math.max(0, n - 1))}>−1</Button>
          <Button size="sm" variant="secondary" onClick={() => setLives((n) => Math.min(3, n + 1))}>+1</Button>
          <LifeHearts lives={3} maxLives={5} size={20} />
          <CharacterBadge character={character} />
          <CharacterBadge character={character} size="sm" />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-bold">결과 오버레이 · 씬</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setOverlay(lifeResult("CLEAR"))}>CLEAR!</Button>
          <Button variant="danger" onClick={() => setOverlay(lifeResult("FAILED"))}>FAILED</Button>
          <Button variant="danger" onClick={() => setOverlay(lifeResult("FAILED", true))}>FAILED → GAME OVER</Button>
          <Button variant="secondary" onClick={() => setOverlay(lifeResult("PERFECT"))}>PERFECT!</Button>
          <Button variant="secondary" onClick={() => setScene("over")}>GAME OVER 씬</Button>
          <Button variant="secondary" onClick={() => setScene("grad")}>GRADUATION 씬</Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>강의노트 Drawer</Button>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">홈 후배 카드</h2>
        <JuniorCard run={{ ...RUN, character }} />
        <JuniorCard run={{ ...RUN, character, lives: 1, canGraduate: true, progress: { cleared: 8, total: 8, chapters: [] }, next: null }} />
        <JuniorCard run={null} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">선배용 강의노트</h2>
        <Card className="p-5"><TeacherNoteBody note={NOTE} /></Card>
      </section>

      <section>
        <JuniorSelect onSelect={(c) => setCharacter(c)} />
      </section>

      {overlay && <ResultOverlay result={overlay} character={character} onClose={() => setOverlay(null)} onGameOver={() => { setOverlay(null); setScene("over"); }} />}
      {scene === "over" && <GameOverScene character={character} onNext={() => setScene("none")} />}
      {scene === "grad" && (
        <GraduationScene character={character} nextHref="/dev/game" summary={{ runId: "run_demo", character, materialTitle: "4장 프로세스 스케줄링", courseName: "운영체제", days: 3, chapters: 8, exams: 14, averageScore: 86, perfectCount: 2, wrongNoteCount: 7, finalLives: 2, maxLives: 3, graduatedAt: new Date().toISOString() }} />
      )}
      <TeacherNoteDrawer open={drawer} onClose={() => setDrawer(false)} chapterTitle="CPU 스케줄링 알고리즘" note={NOTE} />
    </div>
  );
}
