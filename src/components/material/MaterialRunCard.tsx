/**
 * 자료 페이지 상단의 현재 후배 카드(Run 있음) / 후배 선택 안내(Run 없음).
 */
import Link from "next/link";
import type { RunDto } from "@/contracts/game";
import { CHARACTERS } from "@/contracts/game";
import { Button, Card } from "@/components/shell/ui";
import { CharacterBadge } from "@/components/game/CharacterBadge";
import { FinalExamAction, finalStageText, inFinalStage } from "@/components/game/FinalExamAction";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import { LifeHearts } from "@/components/game/LifeHearts";

export function MaterialRunCard({ run, materialId: id }: { run: RunDto; materialId: string }) {
  return <Card className="mb-5 grid gap-4 sm:grid-cols-[96px_1fr_auto] sm:items-center"><div className="mx-auto h-24"><JuniorAvatar character={run.character} size={96} mood={run.lives === 1 ? "confused" : "idle"} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CharacterBadge character={run.character} avatar={false} /><LifeHearts lives={run.lives} maxLives={run.maxLives} size={20} /><Link className="ml-2 text-sm font-semibold text-primary underline" href={`/materials/${id}/junior`}>후배 변경</Link></div><p className="mt-2 text-sm text-muted">졸업까지 <span className="font-bold text-ink tabular-nums">{run.progress.cleared} / {run.progress.total}</span> 챕터 · 합격 {run.passScore}점 · {run.examFormat === "OBJECTIVE" ? "객관식" : "서술형"} {CHARACTERS[run.character].questionCount}문항</p>{inFinalStage(run) && <p className="mt-1 text-sm font-semibold text-primary">{finalStageText(run)}</p>}{run.status !== "ACTIVE" && <p className="mt-1 text-xs text-danger">이 후배는 {run.status === "GRADUATED" ? "졸업했어요" : "떠났어요"}. 새 후배를 만나세요.</p>}</div>{inFinalStage(run) ? <FinalExamAction run={run} className="sm:w-48" /> : run.status !== "ACTIVE" ? <Link href={`/materials/${id}/junior`}><Button>새 후배 만나기</Button></Link> : null}</Card>;
}

export function ChooseJuniorCard({ materialId: id }: { materialId: string }) {
  return <Card className="mb-5 flex flex-col items-center gap-3 border-primary bg-primary-soft p-5 text-center sm:flex-row sm:text-left"><JuniorAvatar character="KU_HARD" size={88} mood="talk" /><div className="min-w-0 flex-1"><p className="text-lg font-black">먼저 가르칠 후배를 골라 주세요</p><p className="mt-1 text-sm text-muted">후배마다 이해 방식·시험 형식·합격선이 다릅니다. 자료와 진도를 유지하면서 다른 후배를 선택할 수 있어요.</p></div><Link href={`/materials/${id}/junior`}><Button>후배 선택 →</Button></Link></Card>;
}
