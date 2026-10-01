# KUREND 게임 시스템 확장 — 3인 분업 실행 계획

> 입력: `docs/teachback-game-system-expansion.md`(원 기획). 이 문서는 **"무엇을 · 누가 · 어떤 순서로 · 어떤 계약으로"** 만들지 확정하는 실행 계획이다.
> 코드 변경은 아직 없음. main 직접 작업(브랜치 없음) 전제.

---

## 0. 한눈에 보기

| 역할 | 이름 | 한 줄 요약 | 소유 영역 (이 영역 밖 파일은 건드리지 않음) |
|---|---|---|---|
| ① | **게임 코어** (DB·룰·API·시드) | Run/LIFE/졸업/오답노트/강의노트의 **저장과 판정** | `prisma/**`, `src/lib/server/**`, `src/app/api/runs/**`, `src/app/api/wrong-notes/**`, `src/app/api/materials/[id]/teacher-note/**`, `src/app/api/sessions/[id]/game/**`, `src/contracts/game.ts`, `scripts/smoke-api.ts`, `docs/game-api.md` |
| ② | **AI 후배** (페르소나·시험형식·생성) | 후배 3명의 **말투·이해방식·시험·강의노트·오답진단** | `src/lib/llm/**`(prompts, stub, routes/handlers, tests, fixtures), `scripts/eval-llm.ts`, `docs/llm-personas.md` |
| ③ | **화면·연출** (UI/UX) | 후배 선택·LIFE·결과 오버레이·GAME OVER/졸업 연출·오답노트·강의노트 **화면 전부** + 디자인 리프레시 | `src/app/**/page.tsx`·`layout.tsx`, `src/components/**`, `src/lib/client/**`, `public/**`, `src/mocks/**`(필요 시) |

- ①은 의존성의 뿌리라서 **가장 먼저 끝나야** 한다(Day 1 오전 목표). ③은 ①이 끝날 때까지 정적 props로 화면을 먼저 만든다.
- 사람↔역할 추천: 기존 C(백엔드) 작업자 → ①, 기존 D(LLM 품질) 작업자 → ②, 기존 B/B2(세션·시험 화면) 작업자 → ③. (A 역할의 셸/홈 화면도 ③이 흡수)
- 경계 파일은 딱 3개: `src/contracts/game.ts`(① 작성·수정), `src/lib/llm/routes/backend.ts`의 `SessionRecord.game?`(② 추가), `src/lib/llm/routes/prisma-backend.ts`(① — ②가 요구하는 `game` 스냅샷 채움).

---

## 1. Day 0 — 코딩 전에 셋이 30분 합의할 것 (①이 초안 작성)

### 1-1. 핵심 룰 (숫자·판정)

| 항목 | 결정 |
|---|---|
| 후배 | `MALE_EASY`(남학생) · `FEMALE_NORMAL`(여학생) · `KU_HARD`(KU) |
| 합격선 | 60 / 70 / 80 |
| 시험 형식 | 남학생 **객관식 4지선다** · 여학생 **서술형(의미 설명)** · KU **서술형 + 이유/비교/응용 1문제** |
| 기존 `juniorLevel`(FROZEN enum EASY/HARD) 매핑 | MALE·FEMALE → `EASY`, KU → `HARD`. 세션 생성 시 서버가 Run의 캐릭터로 자동 설정. 캐릭터 세부 차이는 새 `persona` 입력으로 전달 (enum 불변) |
| LIFE | `MAX_LIVES=3` 기본(생성 시 5 선택 가능). 시험 1회 = 결과 1회. `score < 합격선` → −1, `score == 100` → +1(단 `lives < max`). **세션당 1회만 적용(멱등)** |
| 챕터 통과 | `bestScore(이 Run에서) ≥ 합격선` → `cleared` |
| 졸업(P0) | 자료의 모든 챕터 `cleared` → "졸업하기" 가능. (P1) + 졸업시험 합격 |
| GAME OVER | `lives == 0` 되는 순간 Run `GAME_OVER`. 자료·세션·오답노트·강의노트·`Chapter.taughtAt/stableAt`은 유지, **Run 범위 데이터(진행도·숙련도·후배 기억)만 새 Run에서 0부터** |
| Run 단위 | **사용자 × 자료 × 캐릭터**. 자료당 ACTIVE Run은 최대 1개. 졸업앨범 항목("KU · 운영체제 · 86점")과 일치 |
| Run 없는 세션 | 허용(= 연습 모드, LIFE 영향 없음). 기존 플로우·스모크 테스트가 깨지지 않게 하는 안전장치. 화면에서는 항상 후배 선택을 먼저 거치게 함 |
| 진행 중 Run이 끝난 뒤 남은 세션 | 그대로 끝낼 수 있음. `/life` 호출 시 `applied:false, runStatus:"GAME_OVER"` 응답 |

### 1-2. 데이터 모델 (additive — FROZEN 모델에는 **nullable 컬럼만** 추가)

```prisma
model JuniorRun {              // run_
  id String @id
  userId String; materialId String
  character String             // MALE_EASY | FEMALE_NORMAL | KU_HARD
  lives Int; maxLives Int @default(3)
  status String @default("ACTIVE")   // ACTIVE | GAME_OVER | GRADUATED
  startedAt DateTime @default(now()); endedAt DateTime?
  summaryJson String?          // 졸업/게임오버 시점 통계 스냅샷
  @@index([userId, materialId, status])
}
model ChapterProgress { runId, chapterId, attempts Int, bestScore Int?, cleared Boolean, clearedAt DateTime?  @@id([runId, chapterId]) }
model LifeEvent      { id, runId, sessionId @unique, outcome String /*CLEAR|FAILED|PERFECT*/, delta Int, livesBefore Int, livesAfter Int, score Int, passScore Int, createdAt }   // sessionId unique = 멱등 키
model ConceptMastery { runId, chapterId, concept, exposureCount Int, mastery Int /*0~100*/  @@id([runId, chapterId, concept]) }   // P1 (KU)
model TeacherNote    { id, materialId, chapterId @unique, noteJson String, createdAt }
model WrongNote      { id, userId, runId?, sessionId, qid, userReason String, aiDiagnosis String, aiComparison String?, missedConceptsJson String, createdAt  @@unique([sessionId, qid]) }   // P1

// FROZEN 모델 additive 컬럼
Session      + runId String?   + kind String @default("CHAPTER")   // kind: CHAPTER | FINAL (P1 졸업시험)
Exam         + format String @default("DESCRIPTIVE")               // DESCRIPTIVE | OBJECTIVE
ExamQuestion + choicesJson String?                                  // 객관식 보기 4개
```

### 1-3. 새 계약 파일 `src/contracts/game.ts` (①이 Day 0에 작성, 셋이 리뷰 후 ①만 수정)

```ts
export const CHARACTERS = {
  MALE_EASY:     { name:"남학생", label:"EASY",   level:"EASY", examFormat:"OBJECTIVE",   passScore:60, tagline:"이해가 빠른 후배 · 객관식 시험" },
  FEMALE_NORMAL: { name:"여학생", label:"NORMAL", level:"EASY", examFormat:"DESCRIPTIVE", passScore:70, tagline:"이해는 빠르지만 서술형 시험" },
  KU_HARD:       { name:"KU",     label:"HARD",   level:"HARD", examFormat:"DESCRIPTIVE", passScore:80, tagline:"이해시키기 어려움 · 반복 설명 필요 · 서술형" },
} as const;

RunDto            { runId, materialId, materialTitle, courseName, character, lives, maxLives, status, startedAt, endedAt,
                    progress: { cleared:number, total:number, chapters:[{chapterId,title,order,attempts,bestScore,cleared}] },
                    next: {chapterId,title} | null, canGraduate: boolean }
ApplyLifeResponse { applied:boolean, outcome:"CLEAR"|"FAILED"|"PERFECT"|"NONE", score, passScore, livesBefore, livesAfter, maxLives,
                    runStatus, chapter:{cleared,bestScore,firstClear:boolean}, canGraduate }
SessionGameDto    { run: RunDto|null, examFormat, passScore, lifeEvent: {...}|null, mastery: ConceptMasteryDto[] }   // 헤더·결과 화면용
GraduationSummaryDto { character, materialTitle, days, chapters, exams, averageScore, perfectCount, wrongNoteCount, finalLives, maxLives, graduatedAt }
TeacherNoteDto    { chapterId, mustTeach:string[], keyTakeaways:string[], confusing:string[], likelyQuestions:string[] }
WrongNoteDto      { wrongNoteId, sessionId, qid, courseName, materialTitle, chapterTitle, question, choices?, answer, score, maxScore, verdict,
                    userReason, aiDiagnosis, aiComparison|null, evidenceQuote, sourceExcerpt, missedConcepts:string[], createdAt }
ConceptMasteryDto { concept, exposureCount, mastery }
SessionGameSnapshot (②의 SessionRecord.game 용) { runId, character, lives, maxLives, passScore, examFormat, mastery: ConceptMasteryDto[], runTaught?: TaughtMsg[] /*FINAL 세션만*/ }
```

### 1-4. FROZEN 파일에 손대는 **최소 additive 변경** (optional 필드만, 합의 후 각 소유자가 반영)

| 파일 | 변경 | 담당 |
|---|---|---|
| `src/contracts/types.ts` | `ExamQuestionSchema` / `ResultItemSchema`에 `choices: z.array(z.string()).optional()`; `CreateSessionRequestSchema`에 `focusConcepts?: string[]`(P1) | ① (A 역할 흡수) |
| `src/lib/llm/types.ts` | 모든 입력에 `persona?: JuniorCharacter`; `prepareSession`에 `examFormat?`, `focusConcepts?`(P1), `kind?: "CHAPTER"\|"FINAL"`(P1); `writeExamAnswer`에 `choices?`, `mastery?`(P1); `juniorTurn` `concepts` 이벤트에 `mastery?: {concept, mastery}[]`(P1); **새 메서드** `generateTeacherNote`, `diagnoseWrongNote`(P1) | ② |
| `src/lib/llm/routes/backend.ts` | `SessionRecord.game?: SessionGameSnapshot`; `commitSession`은 `next.game.mastery`를 영속화(P1) | ② 선언 / ① 구현 |
| `prisma/schema.prisma` | §1-2 | ① |

### 1-5. 화면 라우트 (③)

`/materials/[id]/junior`(후배 선택) · `/runs/[id]/game-over` · `/runs/[id]/graduation` · `/wrong-notes`, `/wrong-notes/[id]`(P1) · `/album`(P2). 강의노트는 자료 페이지 섹션 + 가르치기 화면 Drawer.

---

## 2. ① 게임 코어 — 작업 목록 (의존 순서)

| # | P | 작업 | 산출물 / 완료 기준 |
|---|---|---|---|
| 1 | P0 | `src/contracts/game.ts` + 스키마 변경 + `pnpm db:push` | 셋이 리뷰 완료, typecheck 통과 |
| 2 | P0 | `POST /api/runs {materialId, character, maxLives?}` · `GET /api/runs/current?materialId=` · `GET /api/runs/{id}` | 자료당 ACTIVE 1개(409 `RUN_ACTIVE`), 소유권 404, RunDto의 progress/next/canGraduate 계산 |
| 3 | P0 | 세션 생성 시 Run 자동 연결: `POST /sessions`에서 (user, chapter.material) ACTIVE Run 조회 → `runId`, `juniorLevel`을 캐릭터로 강제. Run 있으면 `PATCH juniorLevel` 409 | 기존 149 스모크 그대로 통과 |
| 4 | P0 | `GET /api/sessions/{id}/game` → `SessionGameDto` | 헤더·결과 화면이 단일 호출로 LIFE/합격선/형식/숙련도 획득 |
| 5 | P0 | `POST /api/runs/{id}/life {sessionId}` | 서버가 `session.score`로 판정(클라이언트 점수 신뢰 안 함). `LifeEvent.sessionId` unique로 멱등. ChapterProgress 갱신, `lives==0`→GAME_OVER+summaryJson. 세션 상태 RESULT_READY/REVIEWING/COMPLETED만 허용 |
| 6 | P0 | `POST /api/runs/{id}/graduate` | 모든 챕터 cleared 아니면 409 `NOT_READY`. `GraduationSummaryDto` 계산·저장 |
| 7 | P0 | `prisma-backend.ts`: `SessionRecord.game` 스냅샷 채움 (run·character·passScore·examFormat·mastery) | ②의 handlers가 persona를 받음 |
| 8 | P0 | 강의노트: `GET /api/materials/{id}/teacher-note` (챕터별 note\|null) · `POST … {chapterId}` → ②의 `llm.generateTeacherNote` 호출 후 저장(1회 생성, 삭제 없음) | 두 번째 호출은 캐시 반환 |
| 9 | P0 | 시드/픽스처 (`prisma/seed.ts`, `seed-data/runs.json`) — 데모 Scene용 3계정 상태: 체험1 = KU·운영체제 ♥♥♡ 4/6 cleared(평상 데모) / 체험2 = KU·경제학 ♥♡♡ (Scene 3·4·6: 한 번 실패하면 GAME OVER) / 체험3 = KU 6/6 cleared(Scene 7 졸업). 강의노트는 ②의 fixture JSON을 그대로 적재(무대에서 LLM 대기 없음) | `pnpm db:reset` 한 번에 재현 |
| 10 | P0 | `scripts/smoke-api.ts` 확장: Run 생성→세션→(stub) 시험 실패→life −1→… →GAME_OVER / 100점→+1 / 졸업 409·200 / 멱등성 | 체크 ≥ 30개 추가, dev·prod 통과 |
| 11 | P1 | 오답노트: `POST /api/wrong-notes {sessionId, qid, userReason}` (aiDiagnosis는 **이미 있는 Gap**(diagnosis/evidenceQuote/sourceExcerpt/concepts)에서 즉시 구성, `aiComparison`은 ②의 `diagnoseWrongNote` 호출·stub이면 템플릿) · `GET /api/wrong-notes?materialId=` · `GET /api/wrong-notes/{id}` · `POST /api/wrong-notes/{id}/reteach` → 같은 챕터에 `focusConcepts` 세션 생성, `{sessionId}` 반환 | (sessionId,qid) unique |
| 12 | P1 | KU 숙련도 영속화: `commitSession`이 `next.game.mastery` upsert | ConceptMastery 테이블 |
| 13 | P1 | 졸업시험 저장소: 자료당 합성 Chapter(`kind:"FINAL"`, DTO·카운트에서 제외) + `Session.kind=FINAL` + `game.runTaught`(Run 전체의 USER 메시지) 제공. `/graduate`가 FINAL 세션 합격 요구 | 설계는 P0 완료 후 확정 |
| 14 | P2 | `GET /api/runs/album` (GRADUATED + GAME_OVER 목록) | — |
| 15 | 상시 | `docs/game-api.md` (요청/응답 예시, 에러 코드 `RUN_ACTIVE`·`NOT_READY`·`NO_RUN`) | ③이 이 문서만 보고 붙일 수 있게 |

메모: `POST /api/runs/{id}/game-over`는 **구현하지 않음** — 데모는 시드(체험2 ♥♡♡)로 재현한다. 필요하면 `DEMO_CONTROLS=1`일 때만 여는 dev 전용 라우트로.

---

## 3. ② AI 후배 — 작업 목록

| # | P | 작업 | 완료 기준 |
|---|---|---|---|
| 1 | P0 | `src/lib/llm/personas.ts`: 3캐릭터 사양(말투, 되묻기 빈도, 오해 성향, 기억 모델, 시험 형식, 합격선) — prompts와 stub이 **같은 사양**을 읽음 | Rule 3: 캐릭터마다 이해·기억·되묻기·시험형식·합격선이 다름 |
| 2 | P0 | `types.ts` additive 입력(§1-4) + `handlers.ts`가 `session.game`에서 persona/choices/mastery를 꺼내 모든 llm 호출에 전달 | `game` 없으면 기존 동작(연습 모드) 그대로 |
| 3 | P0 | `prepare-session`: 형식별 출제 — 남학생 객관식(보기 4, rubric=정답 번호+근거), 여학생 서술형(의미), KU 서술형+응용 1문. 문항 수는 3·배점 34/33/33 유지(FROZEN evaluate 검증 그대로) | zod 스키마 `choices` 4개·중복 없음 |
| 4 | P0 | `respond-turn` / `analyze-turn`: 페르소나 행동 — 남학생(잘 따라옴, 단순 질문, 되묻기 적음) / 여학생("왜 그런가요?", 의미 지향) / KU(애매하면 **오해한 채로 되묻기**, 되묻기 많음). Scene 3 대사 수준: "잠깐만 선배. 그러면 가격이 오르면 수요도 늘어난다는 거야?" | Rule 2: 가르친 것 이상은 모름 |
| 5 | P0 | `write-exam-answer`: 객관식이면 보기 중 하나 선택 + 한 줄 이유(`final.answer = "② …"`), `sentences`는 기존 그대로 ref 표시 | 보기 밖 답 금지 |
| 6 | P0 | `grade-exam`: 객관식은 **결정적 채점**(rubric 정답 번호 비교, CORRECT/WRONG만, LLM은 오답 Gap 진단에만) → 비용↓·안정성↑ | 틀린 문항마다 Gap 1개(기존 검증 규칙) |
| 7 | P0 | `generateTeacherNote({chapter})` → `{mustTeach, keyTakeaways, confusing, likelyQuestions}` prompt + stub + **시드 자료용 fixture JSON** (`src/lib/llm/fixtures/teacher-notes.{os,econ}.json`; ①의 시드가 그대로 사용) | 11개 챕터 전부 |
| 8 | P0 | `stub.ts` 데모 패리티: 캐릭터별 대사, Scene 3 KU 오해 대사(경제 자료 "수요의 법칙"), Scene 4 — 핵심 개념 빠진 설명이면 **58점**이 나오도록 결정적 채점 규칙, 100점 경로(완전한 설명) | 키 없이도 Scene 1~7 재현 |
| 9 | P0 | 테스트: `__tests__/personas.test.ts`, `eval:llm` 케이스 3캐릭터×(합격/실패) | `pnpm test`·`eval:llm` 통과 |
| 10 | P1 | KU 반복 학습: `analyze-turn`이 설명 품질로 개념별 mastery(0~100) 산출 → `concepts` 이벤트에 `mastery` 포함; `write-exam-answer`가 mastery 낮은 개념은 FAINT/NONE·오답 경향 | "매우 명확 1~2회 / 보통 2회 / 애매 3회+" |
| 11 | P1 | `diagnoseWrongNote({question, answer, grade, gap, userReason, taught})` → `{agree:"YES"\|"PARTLY"\|"NO", comparison, missedConcepts}` ("맞아요. 특히 … 'Time Quantum'을 …") + stub | 사용자 글을 먼저 받고 비교하는 문구 |
| 12 | P1 | 재학습 세션: `prepareSession({focusConcepts})` → 해당 개념만 목표 2~3개·짧은 첫 질문 | "오늘의 재교육" |
| 13 | P1 | 졸업시험: `prepareSession({kind:"FINAL"})` 전체 자료 범위 출제(캐릭터별 형식, 3문항 유지 — 5~10문항은 P2), `writeExamAnswer`가 `runTaught` 사용 | ①의 #13과 함께 |
| 14 | 상시 | `docs/llm-personas.md` (대사 톤 가이드, 금지사항) | ③의 UI 카피와 톤 일치 |

---

## 4. ③ 화면·연출 — 작업 목록

| # | P | 화면 / 컴포넌트 | 데이터 | 비고 |
|---|---|---|---|---|
| 1 | P0 | `components/game/` 기본 요소: `LifeHearts`(♥♥♡, +1/−1 트랜지션), `CharacterBadge`(`KU · HARD`), 캐릭터 일러스트 3종(남학생·여학생 신규, `mascot/` 스타일 통일) | — | Day 0부터 정적 작업 가능 |
| 2 | P0 | 후배 선택 `/materials/[id]/junior` — "이번에는 어떤 후배를 졸업시켜볼까요?" 카드 3장 | `POST /runs` | 자료 페이지 "가르치기"에서 ACTIVE Run 없으면 여기로 |
| 3 | P0 | 자료 페이지(`app/materials/[id]/page.tsx`): 현재 후배 미니카드, 챕터별 `cleared`/시도/최고점(Run 기준), "선배용 강의노트 보기" | `GET /runs/current?materialId`, `GET …/teacher-note` | 기존 쉽게/어렵게 토글은 Run 있으면 숨김 |
| 4 | P0 | 가르치기 헤더: `StepperHeader` `right` 슬롯에 `CharacterBadge + LifeHearts`; "강의노트 잠깐 보기" 버튼 → `TeacherNoteDrawer`(SourceDrawer와 같은 패턴, 복사 유도 금지) | `GET /sessions/{id}/game`, teacher-note | KU면 `MasteryBars`(P1) |
| 5 | P0 | 결과 오버레이 `ResultOverlay`: `ResultPage`가 `result` SSE 이벤트 수신 직후 `POST /runs/{id}/life` → **CLEAR! / FAILED(합격 기준·LIFE −1·♥♥♥→♥♥♡) / PERFECT!(LIFE +1 또는 "이미 가득")** 전체화면 → 닫으면 기존 성적표 | `ApplyLifeResponse` | 평소=학습 서비스, 결과=게임 (디자인 톤 §31) |
| 6 | P0 | GAME OVER 씬 `/runs/[id]/game-over`: KU(트럭) · 남학생(두돈반·손 흔들기) · 여학생(멀어짐) — CSS keyframe + 타이핑 텍스트, 마지막 "새로운 후배가 찾아왔어요" → 후배 선택 | `runStatus=GAME_OVER` 시 라우팅 | "어이없고 웃픈" 톤 |
| 7 | P0 | 졸업 씬 `/runs/[id]/graduation`: 학사모·가운·졸업장, 모자 던지기 → `GraduationSummary`(함께한 기간·챕터·시험·평균·PERFECT·오답노트·최종 LIFE) → [새로운 후배 만나기] | `POST /runs/{id}/graduate` | 완료 화면/자료 페이지에 `canGraduate`면 "졸업하기" |
| 8 | P0 | 홈(`app/page.tsx`) 상단 후배 카드: 캐릭터·난이도·LIFE·자료·졸업까지 n/m·다음 수업·[계속 가르치기]; Run 없으면 "후배 만나기" CTA | `GET /runs/current` | |
| 9 | P1 | 오답노트: 결과 화면 WRONG/PARTIAL 문항에 [오답노트 작성] → `WrongNoteForm`(후배 답변·판정 → **내가 먼저 이유 작성** → 저장 후 AI 분석 공개·비교) · 목록 `/wrong-notes` · 상세 `/wrong-notes/[id]` · [다시 가르치기] | wrong-notes API | 힌트는 Gap의 evidenceQuote |
| 10 | P1 | KU `MasteryBars`(개념별 █ 5칸, 정답 노출 금지) · 졸업시험 진입 모달 "졸업시험에 도전할까요?" | `game.mastery`, FINAL 세션 | |
| 11 | P1 | 디자인 리프레시: 게임 요소(하트·오버레이·씬)의 비주얼 언어를 먼저 확정하고, 그 톤으로 홈/자료/세션 화면 다듬기(여백·타이포·카드·마스코트 반응) | — | P0 화면이 먼저, 리프레시는 그 다음 |
| 12 | P2 | 졸업앨범 `/album`(졸업생 + 떠나간 후배), 캐릭터별 추가 대사, 업적 | `/runs/album` | |

③의 작업 방식: Day 0~1 오전은 **정적 props(fixture)로 화면 완성** → ①의 API가 올라오면 `src/lib/client/api.ts`에 `runs/teacherNote/wrongNotes` 클라이언트를 추가해 교체. (①이 늦어지면 `src/mocks/`에 Run 목업을 추가해 자체 진행 — ③ 소유.)

---

## 5. 일정 · 마일스톤 (반나절 단위 추정)

```
Day 0 (오전)  ① game.ts + 스키마 초안 ─ 30분 합의 ─→ ② personas.ts 착수 / ③ 하트·배지·캐릭터·선택 카드 정적 제작
Day 1 (오전)  ① #2~#5 (runs·current·세션 연결·/game·/life)      ② #2~#6 (persona 입력·객관식·채점)     ③ #2 #4 #5 (선택·헤더·오버레이, 정적)
Day 1 (오후)  ① #7 #8 #9 (snapshot·강의노트 API·시드)             ② #7 #8 (강의노트·stub 패리티)         ③ API 연결 (#2 #3 #4 #5 #8)
Day 2         ① #6 #10 #15 (졸업·스모크·문서)                      ② #9 + P1 #10 착수                     ③ #6 #7 (GAME OVER 3종·졸업 씬)
              ───────────────── M1: P0 완료 = Scene 1·2·3·4·6·7 데모 가능 ─────────────────
Day 3         ① #11 #12 (오답노트·숙련도)                           ② #11 #12 (오답진단·재학습)             ③ #9 #10 (오답노트·숙련도 바)
              ───────────────── M2: Scene 5 포함 전체 데모 리허설(체험1·2·3 계정으로) ──────
Day 4~        ① #13 / ② #13 (졸업시험)  ③ #11 (디자인 리프레시) → 남으면 P2
```

차단 관계: ③#5(오버레이)·#8(홈 카드)는 ①#5·#2에, ③#4(강의노트 Drawer)는 ①#8+②#7에, ②#2는 ①#7에 의존. 나머지는 병렬.

---

## 6. 데모 시나리오 ↔ 구현 매핑

| Scene | 내용 | 필요한 것 | 계정/상태 |
|---|---|---|---|
| 1 | 남학생 EASY 소개 | ③#2 선택 화면(카드 3장) | 아무 계정, 새 자료 |
| 2 | KU HARD 선택 | ③#2, ①#2 | 체험2 (경제학, 새 Run) |
| 3 | 잘못 설명 → KU 오해 되묻기 | ②#4 #8 (stub·실 LLM 모두) | 체험2 "수요의 이해" 챕터 |
| 4 | 58점 FAILED, LIFE −1 | ②#8, ①#5, ③#5 | 체험2 ♥♥♡ → ♥♡♡ |
| 5 | 오답노트: 한 줄 작성 → AI 분석 | ①#11 ②#11 ③#9 (P1) | 같은 세션 |
| 6 | GAME OVER (트럭) | ①#5(`lives 0`) ③#6 | 체험2를 시드에서 ♥♡♡로 두면 Scene 4 실패 한 번으로 바로 Scene 6 — 발표 흐름상 **Scene 3→4→6을 한 번에** 이어갈 수 있음 |
| 7 | GRADUATION | ①#6 ③#7 | 체험3 (6/6 cleared) "졸업하기" |

---

## 7. main 직접 작업 규칙 (충돌 방지)

1. 각자 §0 소유 영역만 수정. 남의 영역이 필요하면 **채팅으로 요청** → 소유자가 반영.
2. 커밋 전 `pnpm typecheck && pnpm lint`, ①은 `pnpm tsx scripts/smoke-api.ts`, ②는 `pnpm test`까지. 깨진 main을 올리지 않는다.
3. `git pull origin main`(merge, rebase·force 금지) → 커밋 → 즉시 push. 작은 커밋 자주(반나절 이상 묵히지 않기).
4. 커밋 메시지 접두: `feat(game-core)` / `feat(persona)` / `feat(game-ui)`.
5. 스키마가 바뀌면 ①이 공지 → 전원 `pnpm db:reset`.
6. 계약(`game.ts`, FROZEN additive 항목)은 Day 0 합의본 이후 변경 시 셋 모두에게 알리고 ①만 수정.

---

## 8. 리스크 · 대응

| 리스크 | 대응 |
|---|---|
| FROZEN `evaluate`가 3문항·34/33/33을 강제 | 챕터 시험·졸업시험 모두 3문항 유지(기획의 5~10문항은 P2). 객관식도 3문항 |
| 강의노트 LLM 지연(챕터당 수 초×6) | 온디맨드 + 자료 페이지 진입 시 백그라운드 프리페치, 시드 자료는 fixture JSON 적재 |
| 실 LLM이 Scene 4의 58점을 보장 못 함 | 발표는 stub 또는 시드 상태(♥♡♡)로 흐름 보장, 실 LLM은 Scene 3 대사용으로만 선택 사용 |
| Run 범위 vs 챕터 범위 기록 혼동 | `Chapter.taughtAt/stableAt/bestScore`(사용자 기록, 유지) vs `ChapterProgress`(Run 기록, 리셋) — DTO에서 둘 다 내려주고 UI는 Run 기록을 전면에 |
| 세 사람이 같은 파일 수정 | §0 소유권 + 경계 파일 3개 명시. `ResultPage`·`StepperHeader`·`page.tsx`는 ③만, `handlers.ts`는 ②만, `prisma-backend.ts`·`session-dto.ts`는 ①만 |
| KU 숙련도·졸업시험(P1)이 범위를 키움 | P0 데모(M1)가 끝나기 전에는 착수하지 않음. 졸업시험은 "모든 챕터 합격 = 졸업"으로 대체 가능 |
