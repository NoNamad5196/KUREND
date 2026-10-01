# 게임 시스템 확장 — 역할별 시작 프롬프트

계획: `docs/game-expansion-plan.md` · 원 기획: `docs/teachback-game-system-expansion.md`

## 시작 순서

```
T+0      ① Step 0 (game.ts + 스키마, 2시간)     ② Step 0 (personas·강의노트·fixtures)     ③ Step 0 (정적 컴포넌트·씬)
          ─ ①이 "[①] game.ts·스키마 올렸음" 공지 → ②·③ 30분 리뷰 ─
T+2h     ① Step 1 (runs·life·/game)             ② Step 1-1 backend.ts game? 즉시 푸시    ③ Step 1 (api 클라이언트)
                                                 ② Step 1-2~ (handlers·프롬프트·객관식)
          ─ "[①] runs/current/life/sessions-game 푸시" → ③ Step 2-A 연결 ─
Day 1 PM ① Step 2 (스냅샷) → Step 3 (teacher-note, ② Step 0 뒤)   ② Step 2 (stub 패리티)   ③ Step 2-A
          ─ "[①] game 스냅샷 푸시" → ② 실 DB 확인 ─  ─ "[①] teacher-note 푸시" → ③ Step 3 ─
Day 2    ① Step 4 (졸업·시드·스모크·문서)         ② 테스트                                 ③ 씬 마무리
          ─ "[①] graduate·시드·game-api.md 푸시" + "[②] stub 패리티 푸시" → ③ Step 2-B 시드로 Scene 검증 ─
         ════ M1: Scene 1·2·3·4·6·7 데모 가능 ════
```

누가 뭘 기다리는지는 각 프롬프트의 "공지"/"…한 뒤" 문장으로 맞춰져 있다.

---

## ① 게임 코어 — 시작 프롬프트 (가장 먼저)

```text
너는 KUREND(새내기/TeachBack Campus) 레포 kku_hackerton에서 ① 게임 코어(DB·룰·API·시드) 역할을 맡는다.
작업은 main에 직접 한다(브랜치 생성 금지, rebase·force push 금지, git pull origin main 은 merge). 작은 단위로 자주 커밋·푸시한다.

먼저 읽을 것: docs/game-expansion-plan.md §0·§1·§2·§7, docs/teachback-game-system-expansion.md(원 기획) §3~§5·§13·§17~§19·§27·§28, docs/c-backend.md, src/lib/llm/routes/INTEGRATION.md.
FROZEN 계약(src/contracts/types.ts, prisma/schema.prisma 기존 모델, src/lib/llm/types.ts)은 계획서 §1-4의 optional/nullable additive 항목 외에는 절대 수정하지 않는다.

[내 소유 영역] prisma/**, src/lib/server/**, src/contracts/game.ts, src/contracts/types.ts(additive만), src/app/api/runs/**, src/app/api/wrong-notes/**, src/app/api/materials/[id]/teacher-note/**, src/app/api/sessions/[id]/game/**, 기존 C 라우트(src/app/api/{auth,home,materials,sessions,sources}/** — 단 D 핸들러를 마운트하는 materials/[id]/generate, sessions/[id]/{prepare,explanations,exam/answers,evaluate,tutor}는 ② 소유), src/lib/llm/routes/prisma-backend.ts, src/lib/llm/__tests__/prisma-backend.test.ts, scripts/smoke-api.ts, docs/game-api.md.
그 외 src/lib/llm/**(②), src/app/**/page.tsx·src/components/**(③)는 건드리지 않는다. 필요하면 채팅으로 요청한다.

[Step 0 — 지금 바로, 2시간 안에. ②·③이 이 결과를 기다린다]
1. src/contracts/game.ts 작성(계획서 §1-3). zod + 타입 + 상수 + 순수 함수를 한 파일에:
   - JUNIOR_CHARACTERS = ["MALE_EASY","FEMALE_NORMAL","KU_HARD"] 와 타입 JuniorCharacter, RUN_STATUSES = ["ACTIVE","GAME_OVER","GRADUATED"], LIFE_OUTCOMES = ["CLEAR","FAILED","PERFECT","NONE"], EXAM_FORMATS = ["DESCRIPTIVE","OBJECTIVE"]
   - CHARACTERS 테이블(name/label/level/examFormat/passScore/tagline), DEFAULT_MAX_LIVES = 3, MAX_LIVES_OPTIONS = [3,5], PERFECT_SCORE = 100
   - passScoreFor(character), levelFor(character) → "EASY"|"HARD", lifeOutcomeFor({score, passScore, lives, maxLives}) → {outcome, delta} (score<passScore → FAILED −1 / score==100 → PERFECT +1(lives<maxLives일 때만, 아니면 delta 0) / 그 외 CLEAR 0)
   - DTO zod: RunSchema, ApplyLifeResponseSchema, SessionGameSchema(run이 null이면 passScore null·examFormat "DESCRIPTIVE"), GraduationSummarySchema, TeacherNoteSchema(= ②의 생성 출력 {chapterId, mustTeach, keyTakeaways, confusing, likelyQuestions}), TeacherNoteListResponseSchema({chapters:[{chapterId,title,note: TeacherNote|null}]}), WrongNoteSchema, ConceptMasterySchema, SessionGameSnapshot 타입 {runId, character, lives, maxLives, passScore, examFormat, mastery} (②의 SessionRecord.game?용)
   - 요청 zod: CreateRunRequestSchema {materialId, character, maxLives?}, ApplyLifeRequestSchema {sessionId}, TeacherNoteRequestSchema {chapterId}, CreateWrongNoteRequestSchema {sessionId, qid, userReason}
   - GAME_ERROR_CODES = ["RUN_ACTIVE","NOT_READY","NO_RUN"]. FROZEN API_ERROR_CODES는 건드리지 말고 src/lib/server/http.ts의 ApiError/ERROR_STATUS 타입을 넓혀 받는다(RUN_ACTIVE·NOT_READY 409, NO_RUN 404).
2. prisma/schema.prisma 에 계획서 §1-2 추가: JuniorRun, ChapterProgress, LifeEvent(sessionId @unique), ConceptMastery, TeacherNote(chapterId @unique), WrongNote(@@unique([sessionId,qid])) + FROZEN 모델 additive 컬럼 Session.runId String?, Session.kind String @default("CHAPTER"), Exam.format String @default("DESCRIPTIVE"), ExamQuestion.choicesJson String?. src/lib/server/ids.ts 의 IdPrefix에 "run"|"lev"|"tn"|"wn" 추가. pnpm db:push 후 pnpm db:reset 정상.
3. src/contracts/types.ts FROZEN additive, P0에서는 딱 두 곳: ExamQuestionSchema 와 ResultItemSchema 에 choices: z.array(z.string()).optional(). (② Step 1이 이 필드를 기다린다.)
4. pnpm typecheck && pnpm lint → 커밋 "feat(game-core): 게임 계약·스키마 초안" → push → 공지 "[①] game.ts·스키마 올렸음, 30분 리뷰 부탁 / 전원 pnpm db:reset". ②·③ 의견은 ①만 반영한다.

[Step 1 — Day 1 오전: Run·LIFE API. ③이 기다린다]
- 규칙·DTO 조립은 라우트가 아니라 src/lib/server/run-rules.ts(순수 함수: cleared, canGraduate, progress), src/lib/server/run-dto.ts(toRunDto, toSessionGameDto, toGraduationSummary), src/lib/server/run-access.ts(findActiveRun(userId, materialId), loadOwnedRun(req, id))에 둔다. 라우트는 기존 패턴 그대로 withApi + parseJson + requireUser + ApiError.
- POST /api/runs (src/app/api/runs/route.ts): 자료 소유 확인, 같은 자료에 ACTIVE Run 있으면 409 RUN_ACTIVE, lives = maxLives, 모든 챕터의 ChapterProgress 를 0으로 생성.
- GET /api/runs/current?materialId= (src/app/api/runs/current/route.ts): materialId 있으면 그 자료의 ACTIVE Run, 없으면 가장 최근 갱신된 ACTIVE Run. 없으면 { run: null } (404 아님).
- GET /api/runs/[id]: RunDto(progress.chapters·next·canGraduate 포함).
- 세션↔Run 연결: POST /api/sessions(src/app/api/sessions/route.ts)에서 chapter.material 의 ACTIVE Run을 찾아 runId 저장, juniorLevel = levelFor(run.character) 로 강제(body의 juniorLevel 무시). Run 없으면 기존 동작(연습 모드). PATCH /api/sessions/[id] 는 session.runId 가 있으면 409 INVALID_STATE.
- src/lib/server/session-dto.ts: ExamQuestion.choicesJson → choices 로 풀어서 내려준다(SessionDto.exam.questions, ResultDto.items). 객관식 보기를 ③이 보여줘야 한다.
- GET /api/sessions/[id]/game → SessionGameDto {run|null, examFormat, passScore, lifeEvent|null, mastery:[]}. ③의 헤더·결과 화면이 이 한 번의 호출로 끝나야 한다.
- POST /api/runs/[id]/life {sessionId}: loadOwnedSession + assertStatus(["RESULT_READY","REVIEWING","COMPLETED"]), session.runId === id 아니면 404 NO_RUN, session.score 로 lifeOutcomeFor 판정(요청 본문의 점수는 받지 않는다). db.$transaction 안에서 LifeEvent 생성(이미 있으면 그대로 반환, applied:false) → JuniorRun.lives 갱신 → ChapterProgress(attempts+1, bestScore, cleared = bestScore ≥ passScore) → lives 0이면 status=GAME_OVER, endedAt, summaryJson. 응답 ApplyLifeResponse(canGraduate 포함).
- push 후 공지 "[①] runs/current/life/sessions-game 푸시 — ③ 연결 가능".

[Step 2 — ②가 "[②] SessionRecord.game 추가" 공지한 뒤]
- src/lib/llm/routes/prisma-backend.ts: getSession 에서 SessionRecord.game 스냅샷(runId·character·lives·maxLives·passScore·examFormat·mastery)을 채운다. ExamQuestion.choicesJson 은 ExamQuestionDto.choices? 로 읽고 쓴다. Exam.format 은 ExamRecord 에 필드가 없으므로 next.game?.examFormat ?? "DESCRIPTIVE" 로 저장한다. 기존 revision/updatedAt 낙관적 잠금은 그대로.
- src/lib/llm/__tests__/prisma-backend.test.ts 에 스냅샷 케이스 추가 → LLM_PROVIDER=stub LLM_STUB_DELAY_MS=0 pnpm exec tsx --test src/lib/llm/__tests__/prisma-backend.test.ts 통과 → push → 공지 "[①] game 스냅샷 푸시 — ② 실 DB 확인 가능".

[Step 3 — ②가 "[②] personas·generateTeacherNote·fixtures 푸시" 공지한 뒤 (Step 2와 순서 무관, 먼저 해도 됨)]
- GET /api/materials/[id]/teacher-note → TeacherNoteListResponse, POST … {chapterId} → src/lib/llm/index.ts 가 export 하는 llm 싱글턴으로 llm.generateTeacherNote({chapter}) 호출 후 TeacherNote 저장(이미 있으면 캐시 반환, 삭제 API 없음). noteJson 구조 = ②의 출력 shape.
- push 후 공지 "[①] teacher-note 푸시 — ③ Drawer 연결 가능".

[Step 4 — Day 2: 졸업·시드·검증]
- POST /api/runs/[id]/graduate: 모든 챕터 cleared 아니면 409 NOT_READY; status=GRADUATED, endedAt, summaryJson; GraduationSummaryDto(함께한 일수·챕터 수·시험 횟수·평균·PERFECT 횟수·오답노트 수·최종 LIFE) 반환.
- 시드(prisma/seed.ts, prisma/seed-data/runs.json). 주의: 현재 seed.ts 는 자료 2개를 모두 usr_demo1(체험 1)에만 만든다. 체험2(usr_demo2)에는 경제학원론, 체험3(usr_demo3)에는 운영체제 자료를 추가로 시드하고(seedMaterial 을 계정별로 호출) 그 자료에 Run을 연결한다. 체험1 자료 구성은 그대로(스모크의 과목 2개·챕터 6개 체크 기준).
   체험1 = KU·운영체제 ♥♥♡ 4/6 cleared(평상 데모) / 체험2 = KU·경제학원론 ♥♡♡ 진행 0(Scene 3→4→6 을 실패 한 번으로 연속 시연) / 체험3 = KU·운영체제 6/6 cleared(Scene 7 졸업).
   기존 시드 세션: completed 세션(94점)만 체험1의 KU Run에 runId 연결 + juniorLevel 을 HARD 로 변경 + LifeEvent(CLEAR, score 94, passScore 80). inProgress 세션은 runId만 연결, LifeEvent 없음.
   강의노트: ②의 src/lib/llm/fixtures/teacher-notes.{os,econ}.json(챕터 제목 → 노트 맵)을 materials.json 의 챕터 제목으로 chapterId 를 찾아 TeacherNote 에 적재(제목 11개가 정확히 일치해야 함).
- scripts/smoke-api.ts 확장(30개 이상): Run 생성 → 409 중복 → 세션 생성 시 runId/juniorLevel 강제 → (stub) 시험 완료 → /life 판정(FAILED −1, 재호출 applied:false, PERFECT +1, 가득 찬 상태 100점 delta 0) → lives 0에서 GAME_OVER → /graduate 409·200 → /sessions/{id}/game → Run 없는 세션의 /life 404 NO_RUN. 58점/100점 경로는 ②가 docs/llm-personas.md 에 적는 데모 대본 문장을 그대로 쓴다("[②] stub 패리티 푸시" 공지 뒤).
- docs/game-api.md: 모든 엔드포인트의 요청/응답 예시와 에러 코드. ③은 이 문서만 보고 붙인다.
- push 후 공지 "[①] graduate·시드·game-api.md 푸시 — ③ 시드로 Scene 검증 가능".

[M1 이후 — P1] 계획서 §2 #11~#13: 오답노트 API(aiDiagnosis 는 기존 Gap에서 즉시 구성, aiComparison 은 ②의 diagnoseWrongNote), #11 reteach 를 위해 CreateSessionRequestSchema 에 focusConcepts: z.array(z.string()).optional() 추가(①), commitSession 의 ConceptMastery 영속화, 졸업시험 저장소.

[매 커밋 전] pnpm typecheck && pnpm lint → (pnpm db:reset && pnpm dev 띄운 뒤) pnpm tsx scripts/smoke-api.ts 전부 통과 → git pull origin main → 커밋(feat(game-core): …) → git push -u origin main. 깨진 main을 올리지 않는다. 스키마가 바뀌면 공지하고 전원 pnpm db:reset.
```

## ② AI 후배 — 시작 프롬프트 (①과 동시에 시작)

```text
너는 KUREND(새내기/TeachBack Campus) 레포 kku_hackerton에서 ② AI 후배(페르소나·시험 형식·강의노트·stub) 역할을 맡는다.
작업은 main에 직접 한다(브랜치 생성 금지, rebase·force push 금지, git pull origin main 은 merge). 작은 단위로 자주 커밋·푸시한다.

먼저 읽을 것: docs/game-expansion-plan.md §0·§1·§3·§7, docs/teachback-game-system-expansion.md(원 기획) §1(캐릭터 성격)·§10~§11·§24·§26 Rule 1~3, src/lib/llm/README.md, src/lib/llm/routes/INTEGRATION.md.
src/lib/llm/types.ts 의 기존 시그니처는 FROZEN이다. 계획서 §1-4의 optional 입력 추가와 새 메서드 추가만 허용(기존 필드·이벤트 타입 변경 금지).

[내 소유 영역] src/lib/llm/** (단 routes/prisma-backend.ts 와 __tests__/prisma-backend.test.ts 는 ① 소유), D 핸들러를 마운트하는 라우트 파일 src/app/api/materials/[id]/generate/route.ts 와 src/app/api/sessions/[id]/{prepare,explanations,exam/answers,evaluate,tutor}/route.ts, scripts/eval-llm.ts, docs/llm-personas.md.
prisma/**, src/lib/server/**, src/contracts/**, 그 외 src/app/**, src/components/** 는 건드리지 않는다. 필요한 데이터는 SessionRecord.game 스냅샷으로만 받는다(①에게 요청).

[Step 0 — 지금 바로. ① 의존 없음]
1. src/lib/llm/personas.ts: 3캐릭터 사양을 한 곳에 정의하고 prompts 와 stub 이 모두 이 파일을 읽게 한다.
   - MALE_EASY 남학생: 이해·기억 빠름, 되묻기 적음(★★), 질문 단순, 객관식 4지선다, 합격 60
   - FEMALE_NORMAL 여학생: 이해 빠름, 한 번 들으면 기억, "왜 그런가요?"류 의미 질문(★★★), 서술형(의미 설명), 합격 70
   - KU_HARD KU: 이해 느림, 애매한 설명은 오해한 채로 되묻는다(★★★★★), 중요 개념은 한 번으로 못 배움, 서술형+이유/비교/응용 1문, 합격 80
   말투 규칙, 되묻기 빈도, 오해 성향, 기억 모델, 예시 대사(reaction/doubt/question)를 담는다. 숫자(합격선 등)는 ①이 올릴 src/contracts/game.ts 의 CHARACTERS 를 import 해서 쓴다(올라오기 전엔 임시 상수, Step 1에서 반드시 교체).
2. src/lib/llm/types.ts additive: 모든 입력에 persona?: JuniorCharacter(①의 game.ts 타입. 올라오기 전엔 리터럴 유니온, Step 1에서 import 로 교체); prepareSession 에 examFormat?: "DESCRIPTIVE"|"OBJECTIVE"; writeExamAnswer 에 choices?: string[]; 새 메서드 generateTeacherNote(input:{chapter: ChapterText}): Promise<{mustTeach:string[]; keyTakeaways:string[]; confusing:string[]; likelyQuestions:string[]}>. provider.ts 의 llm 싱글턴 객체에도 이 메서드를 추가한다(①이 llm.generateTeacherNote 로 호출). P1용 mastery?/focusConcepts?/kind?/diagnoseWrongNote 는 지금 넣지 않는다.
3. 강의노트: src/lib/llm/prompts/teacher-note.ts + schemas.ts 의 zod 출력 스키마 + live.ts·stub.ts 구현. stub 은 src/lib/llm/fixtures/teacher-notes.os.json, teacher-notes.econ.json(챕터 제목 → 노트 맵)을 먼저 찾고 없으면 points 로 휴리스틱 생성. 픽스처는 prisma/seed-data/materials.json 의 11개 챕터 전부, 제목 문자열을 정확히 일치시킨다(운영체제 6: 프로세스와 스레드 / 스케줄링의 개념과 기준 / CPU 스케줄링 알고리즘 / 라운드 로빈과 시간 할당량 / 다단계 큐와 피드백 큐 / 멀티프로세서 스케줄링과 평가, 경제학원론 5: 수요의 이해 / 수요의 변동 요인 / 공급의 이해 / 시장 균형 / 탄력성). ①의 시드가 이 JSON을 그대로 DB에 넣는다.
4. docs/llm-personas.md: 대사 톤 가이드(③의 UI 카피와 톤 일치용), 금지사항(Rule 2: 가르친 것 이상은 모른다), 그리고 "데모 대본" 절 — 체험2 경제학원론 "수요의 이해" 챕터에서 시연자가 입력할 문장과 기대 결과: (a) 잘못된 설명 → KU 오해 되묻기(Scene 3), (b) 핵심 개념이 빠진 설명 → 58점 FAILED(Scene 4), (c) 완전한 설명 → 100점 PERFECT. ①의 스모크와 ③의 리허설이 이 문장을 그대로 쓴다.
5. 테스트 통과 → 커밋 "feat(persona): 캐릭터 사양·강의노트 생성" → push → 공지 "[②] personas·generateTeacherNote·fixtures 푸시 — ① teacher-note 라우트 연결 가능".

[①이 "[①] game.ts·스키마 올렸음" 공지하면] 30분 안에 game.ts(특히 SessionGameSnapshot·CHARACTERS·TeacherNoteSchema)를 리뷰해 의견을 주고, pnpm db:reset 한다. 이후 스키마 변경 공지 때마다 pnpm db:reset.

[Step 1 — ①의 첫 커밋(src/contracts/game.ts + types.ts 의 ExamQuestionSchema/ResultItemSchema choices?)이 main 에 올라온 뒤]
1. 가장 먼저, handlers 작업 전에: src/lib/llm/routes/backend.ts 의 SessionRecord 에 game?: SessionGameSnapshot(@/contracts/game 에서 import) 추가 → 바로 push → 공지 "[②] SessionRecord.game 추가 — ① 스냅샷 채워줘". (①의 prisma-backend 작업 선행 조건.) personas.ts 임시 상수와 types.ts 리터럴 유니온을 game.ts import 로 교체.
2. src/lib/llm/routes/handlers.ts: session.game?.character 를 persona 로, session.game?.examFormat 을 형식으로 꺼내 prepareSession·juniorTurn·writeExamAnswer·gradeExam 에 전달. game 이 없으면 기존 동작 그대로(연습 모드).
   - 되묻기 가드 해제: juniorTurn 검증에서 session.juniorLevel === "HARD" 면 doubt 를 modelFailure() 하는 조건(handlers.ts 250행 부근)을 제거하고, 되묻기 허용 여부는 persona 로 판단한다(KU_HARD 허용·빈번, FEMALE_NORMAL 의미 질문, MALE_EASY 드묾). KU 가 오해한 채로 되묻는 Scene 3 이 이 가드에 막힌다.
   - 객관식 검증: 문항마다 choices 4개·중복 없음, 후배의 final.answer 가 보기 중 하나로 시작, verdict 는 CORRECT/WRONG 만. ExamRecord.questions(= ExamQuestionDto & {rubric})에 ①이 추가한 optional choices 를 실어 ①이 choicesJson 으로 저장하게 한다.
   - evaluate 는 commitSession 성공 후에 result 이벤트를 보내는 현재 순서를 유지한다(③이 result 수신 직후 /life 를 호출하며, 그 시점에 DB 가 RESULT_READY 여야 한다).
3. 프롬프트:
   - prompts/prepare-session.ts: 페르소나별 출제 — 남학생 객관식(보기 4, rubric = 정답 번호 + 근거), 여학생 서술형(의미 설명), KU 서술형 + 이유/비교/응용 1문. 문항 3개·합계 100 은 prepare/evaluate 핸들러가, 34/33/33 은 schemas.ts 의 prepareSessionSchema 가 검증한다 — 객관식도 이 스키마를 통과해야 하며(choices 만 추가) 검증을 완화하지 않는다.
   - prompts/respond-turn.ts·analyze-turn.ts: 현재의 EASY/HARD 분기("HARD 는 모순이 있어도 doubt 금지")를 persona 분기로 바꾼다. 예시 수준: KU 가 "수요의 법칙"을 잘못 들으면 "잠깐만 선배. 그러면 가격이 오르면 수요도 늘어난다는 거야?"
   - prompts/write-exam-answer.ts: 객관식이면 보기 하나 선택 + 한 줄 이유(final.answer = "② …"), sentences 의 ref 표시는 기존 그대로.
   - prompts/grade-exam.ts: 객관식은 결정적 채점(rubric 의 정답 번호와 비교, LLM 호출 없음), 오답 문항의 Gap 진단만 LLM. 틀린 문항마다 Gap 1개 규칙 유지.
4. pnpm typecheck && pnpm lint + 테스트 통과 → push → 공지 "[②] persona 프롬프트·객관식 푸시".

[Step 2 — Day 1 오후 ~ Day 2: stub 데모 패리티·테스트]
- stub.ts: 캐릭터별 대사; juniorTurn 에서 level === "EASY" 일 때만 contradiction 을 보는 조건(stub.ts 238행 부근)을 persona 기준으로 변경; Scene 3(KU 오해 되묻기, 경제 자료), Scene 4(핵심 개념이 빠진 설명이면 58점이 나오는 결정적 채점), 완전한 설명이면 100점 경로 — 모두 docs/llm-personas.md 데모 대본 문장과 1:1 로 맞춘다. 키 없이도 Scene 1·2·3·4·6·7(M1 범위)이 재현되어야 한다(Scene 5 는 P1 diagnoseWrongNote 이후).
- src/lib/llm/__tests__/personas.test.ts 신설, 기존 테스트 갱신(특히 live-demo.test.ts 의 "HARD accepts a learner claim without a doubt" 를 persona 기준으로), scripts/eval-llm.ts 에 3캐릭터 × (합격/실패) 케이스.
- push 후 공지 "[②] stub 패리티 푸시 — ① 스모크·③ Scene 검증 가능".

[M1 이후 — P1] 계획서 §3 #10~#13: KU 개념 숙련도(concepts 이벤트에 mastery 추가, 낮으면 FAINT/NONE), diagnoseWrongNote, focusConcepts 재학습, kind:"FINAL" 졸업시험. 착수 전에 ①과 스냅샷 필드(mastery, runTaught)를 맞춘다.

[매 커밋 전] pnpm typecheck && pnpm lint → LLM_PROVIDER=stub LLM_STUB_DELAY_MS=0 pnpm exec tsx --test src/lib/llm/__tests__/*.test.ts → (키 있으면 로컬 .env 로만) pnpm eval:llm → git pull origin main → 커밋(feat(persona): …) → git push -u origin main. API 키는 .env(gitignore)에만, 채팅·커밋에 절대 넣지 않는다.
```

## ③ 화면·연출 — 시작 프롬프트 (①과 동시에 시작)

```text
너는 KUREND(새내기/TeachBack Campus) 레포 kku_hackerton에서 ③ 화면·연출(UI/UX) 역할을 맡는다.
작업은 main에 직접 한다(브랜치 생성 금지, rebase·force push 금지, git pull origin main 은 merge). 작은 단위로 자주 커밋·푸시한다.

먼저 읽을 것: docs/game-expansion-plan.md §0·§1·§4·§6·§7, docs/teachback-game-system-expansion.md(원 기획) §2·§3·§6·§11·§13~§16·§20~§25·§31(디자인 톤), src/components/exam/README.md, src/mocks/README.md, docs/b-split.md.
디자인 톤: 평소 = 대학 학습 서비스, 시험 결과·이벤트 = 게임. 게임 요소(LIFE·CLEAR·FAILED·PERFECT·GAME OVER·GRADUATION·캐릭터 이벤트)에서만 강하게.

[내 소유 영역] src/app/**/page.tsx·layout.tsx(src/app/api/** 제외), src/components/**, src/lib/client/**, public/**, src/mocks/**.
prisma/**, src/lib/server/**, src/lib/llm/**, src/contracts/**, src/app/api/** 는 건드리지 않는다. 숫자·규칙(합격선, MAX_LIVES, 캐릭터 메타)은 ①이 올리는 src/contracts/game.ts 의 CHARACTERS 를 import 해서 쓰고 UI 쪽에 중복 정의하지 않는다.

[Step 0 — 지금 바로. ① 의존 없음, 정적 fixture props 로 먼저 완성]
1. src/components/game/ 기본 요소
   - LifeHearts.tsx(♥♥♡, lives/maxLives, −1/+1 전환 애니메이션), CharacterBadge.tsx("KU · HARD"), characters.ts(UI 메타만: 색·일러스트·소개 문구·캐릭터 이벤트 대사)
   - 캐릭터 일러스트: 기존 src/components/mascot/Mascot.tsx·mascot-svg.ts(KU) 스타일로 남학생·여학생 SVG 추가 → JuniorAvatar.tsx(character, mood prop). 학사모·가운·졸업장, 트럭·두돈반 소품도 SVG 로.
2. 후배 선택: JuniorSelect.tsx + src/app/materials/[id]/junior/page.tsx — "이번에는 어떤 후배를 졸업시켜볼까요?" 카드 3장(난이도·한 줄 소개·시험 방식·[선택하기]).
3. 결과 오버레이 ResultOverlay.tsx: CLEAR!(점수·합격!·하트) / FAILED(점수·합격 기준·"후배가 아직 내용을 충분히 이해하지 못했어요"·LIFE −1·♥♥♥→♥♥♡) / PERFECT!(LIFE +1 또는 "이미 체력이 가득 차 있습니다"). 전체화면, 닫으면 기존 성적표.
4. 씬: scenes/GameOverScene.tsx(캐릭터별 3종 — KU 트럭 / 남학생 두돈반·손 흔들기 / 여학생 멀어짐; CSS keyframe + 기존 TypingText, 마지막 "새로운 후배가 찾아왔어요" → 후배 선택으로) + src/app/runs/[id]/game-over/page.tsx. scenes/GraduationScene.tsx(학사모·가운·졸업장, 모자 던지기) + GraduationSummary.tsx + src/app/runs/[id]/graduation/page.tsx. 톤은 "어이없고 웃픈".
5. 홈 후배 카드 JuniorCard.tsx(캐릭터·난이도·LIFE·자료·졸업까지 n/m·다음 수업·[계속 가르치기]; Run 없으면 "후배 만나기" CTA), TeacherNoteDrawer.tsx(src/components/session/SourceDrawer.tsx 와 같은 패턴, 복사 유도 금지).
6. 개발용 미리보기 src/app/dev/game/page.tsx(NODE_ENV !== "production" 에서만): 위 컴포넌트를 fixture props 로 모두 띄워 백엔드 없이 디자인을 다듬는다.
7. pnpm typecheck && pnpm lint && pnpm build → 커밋 "feat(game-ui): 게임 컴포넌트·씬 정적 구현" → push.

[①이 "[①] game.ts·스키마 올렸음" 공지하면] 30분 안에 game.ts(RunDto·ApplyLifeResponse·SessionGameDto·CHARACTERS)를 리뷰해 의견을 주고, pnpm db:reset 한다. 이후 스키마 변경 공지 때마다 pnpm db:reset.

[Step 1 — game.ts 가 main 에 올라온 뒤]
- src/lib/client/api.ts 에 game.ts 의 zod 타입을 붙인 클라이언트 추가: getCurrentRun(materialId?), createRun, getRun, applyLife(runId, sessionId), graduate(runId), getSessionGame(sessionId), getTeacherNotes(materialId), requestTeacherNote(materialId, chapterId)(②의 LLM 메서드 generateTeacherNote 와 이름을 구분). 응답 shape·에러 코드는 ①의 docs/game-api.md 가 올라오면 거기에 맞춘다. 새 코드는 전부 @/lib/client/api 를 쓴다(src/components/session/_api.ts 는 B 시절 복사본 — 여기에 추가하지 말고, 여유가 되면 import 를 @/lib/client/api 로 바꾸고 삭제).
- characters.ts·JuniorSelect 의 임시 상수를 CHARACTERS 로 교체.

[Step 2-A — ①이 "[①] runs/current/life/sessions-game 푸시" 공지한 뒤: 연결]
- 자료 페이지 src/app/materials/[id]/page.tsx: getCurrentRun(materialId) → Run 없으면 "가르치기"가 /materials/[id]/junior 로. 현재 후배 미니카드, 챕터별 Run 기준 cleared/시도/최고점.
- 난이도 토글: 쉽게/어렵게 선택은 src/components/session/prepare/PreparePage.tsx(LEVELS·PATCH juniorLevel)에 있다. Run 있는 세션(getSessionGame → run !== null)이면 이 선택 UI 를 숨기고 CharacterBadge 만 표시(①이 PATCH 를 409 로 막음).
- 가르치기 헤더: src/components/session/teach/TeachPage.tsx 가 StepperHeader 의 right 슬롯에 넘기는 기존 쉽게/어렵게 Chip(218~220행 부근)을 Run 있을 때 CharacterBadge + LifeHearts(getSessionGame)로 교체. SourcePeekButton·학습 목표 버튼은 그대로. Run 없는 세션은 기존 Chip 유지.
- 객관식 시험 표시: src/components/exam/pages/ExamPage.tsx 와 ResultPage.tsx(AnswerSheet)에서 question.choices 가 있으면 보기 4개(①~④)를 렌더링하고 후배의 답 "② …" 를 보기와 매칭해 강조한다(남학생 EASY 시험).
- 결과: src/components/exam/pages/ResultPage.tsx 가 result SSE 이벤트를 받은 직후 applyLife(run.runId, sessionId) → 응답 applied 가 true 일 때만 ResultOverlay → runStatus === "GAME_OVER" 면 닫을 때 /runs/[id]/game-over 로. 재진입(applied:false)은 오버레이 없이 하트만 표시.
- 홈 src/app/page.tsx 상단에 JuniorCard(getCurrentRun()).
- 체크: pnpm db:reset && pnpm dev → 체험1 로 후배 선택 → 가르치기 헤더 하트 → 시험 → 오버레이까지(이 시점엔 stub 점수가 아직 캐릭터별이 아닐 수 있음 — 오버레이 분기만 확인), 390px 폭에서 깨지지 않음.

[Step 2-B — ①이 "[①] graduate·시드·game-api.md 푸시", ②가 "[②] stub 패리티 푸시" 공지한 뒤: 졸업 연결 + 시드로 Scene 검증]
- 졸업: CompletePage(src/components/exam/pages/CompletePage.tsx)·자료 페이지에서 canGraduate 면 "졸업하기" → graduate() → /runs/[id]/graduation. 씬 마지막 [새로운 후배 만나기] → /materials/[id]/junior.
- pnpm db:reset && pnpm dev → 체험1(평상·♥♥♡) / 체험2(♥♡♡: ②의 데모 대본대로 한 번 실패 → FAILED 오버레이 → GAME OVER 씬) / 체험3(졸업) 로 Scene 1·2·3·4·6·7 통과.

[Step 3 — ①이 "[①] teacher-note 푸시" 공지한 뒤]
- 자료 페이지에 "선배용 강의노트 보기" 섹션(챕터별 가르쳐야 할 것 / 이것만은 / 헷갈리기 쉬운 / 후배가 물어볼 질문, 없으면 [생성]); 자료 페이지 진입 시 없는 챕터 노트를 순차 백그라운드 생성.
- src/components/session/teach/TeachPage.tsx 에 SourcePeekButton 옆 "강의노트 잠깐 보기" → TeacherNoteDrawer.

[M1 이후 — P1·P2] 계획서 §4 #9~#12: 오답노트 화면(결과 화면 WRONG/PARTIAL 문항 [오답노트 작성] → 내가 먼저 이유 작성 → 저장 후 AI 분석 공개·비교 → [다시 가르치기]; /wrong-notes, /wrong-notes/[id]), KU MasteryBars(정답 노출 금지), 디자인 리프레시(게임 요소의 비주얼 언어를 기준으로 홈/자료/세션 다듬기), 졸업앨범 /album.

[매 커밋 전] pnpm typecheck && pnpm lint && pnpm build → 수동 플로우 확인 → git pull origin main → 커밋(feat(game-ui): …) → git push -u origin main. 깨진 main을 올리지 않는다. 다른 사람 영역이 필요하면 코드 대신 채팅으로 요청한다.
```
