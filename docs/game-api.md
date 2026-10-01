# KUREND 게임 API (① 게임 코어)

> 타입·zod 정본은 `src/contracts/game.ts`. 클라이언트는 `src/lib/client/game-api.ts`(③).
> 화면: 오답노트 목록 `/wrong-notes`, 상세 `/wrong-notes/[id]` (상단 탐색의 "오답노트"), 결과 화면에 저장 안내·문항별 링크.
> base `/api`, 인증 쿠키 `tb_uid`. 오류 형식은 기존과 같다: `{ "error": { "code", "message" } }`.

## 0. 룰 요약

| 후배 | `character` | 난이도 표시 | 세션 `juniorLevel` | 시험 형식 | 문항 수 | 합격선 |
|---|---|---|---|---|---|---|
| 남학생 | `MALE_EASY` | EASY | EASY | `OBJECTIVE`(객관식 4지선다) | 5 | 60 |
| 여학생 | `FEMALE_NORMAL` | NORMAL | EASY | `DESCRIPTIVE` | 5 | 70 |
| KU | `KU_HARD` | HARD | HARD | `DESCRIPTIVE`(+응용) | 5 | 80 |
| (졸업시험) | — | 후배 그대로 | 후배 그대로 | `MIXED`(앞 절반 객관식 + 뒤 절반 서술형) | 10 | 후배 합격선 |

- 문항은 AI(②)가 출제한다. 배점은 `pointsPlan(n)`으로 합계 100이다. 일반 후배 챕터 시험은 5문항 각 20점, 졸업시험은 10문항 각 10점, 연습 모드 3문항은 34/33/33점이다.
- 새 후배 챕터 세션은 자료에서 서로 다른 핵심 개념 5개를 골라 학습 목표 `o1`~`o5`와 연결한다. 문항 `q1`~`q5`는 각각 같은 번호의 목표 하나를 평가하며, 질문 표현은 학습 대화를 복사하지 않고 시험 형식으로 바꾼다. `objectiveRefFor(i)`는 `o${i + 1}`을 반환하며 목표를 순환 재사용하지 않는다.
- 졸업시험은 자료 전체 범위의 목표 10개와 문제 10개(`o1`~`o10`)를 유지한다. Run 없는 연습 모드는 목표·서술형 문제 각 3개다. 이미 저장된 과거 시험은 문항 수와 배점을 그대로 유지한다.
- 목표·출제는 자료를 참고하지만 후배의 시험 답안은 저장된 사용자 설명만 참고한다. 학습 대화의 persona를 시험 문제·답안 생성에는 적용하지 않는다.

- **Run** = 사용자 × 자료 × 후배. 자료당 `ACTIVE` Run 은 최대 1개.
- **LIFE**: 기본 3(생성 시 5 선택). 시험 1회 = 판정 1회.
  - `score < 합격선` → `FAILED` −1
  - `score == 100` → `PERFECT` +1 (이미 가득이면 0)
  - 그 외 → `CLEAR` 0
  - 세션당 1회만 적용된다(멱등). 점수는 서버의 `Session.score` 만 쓴다.
- **챕터 통과**: 이 Run 에서의 최고점 ≥ 합격선.
- **GAME OVER**: LIFE 0 이 되는 순간. 자료·세션·`Chapter.taughtAt/stableAt` 은 남고, 새 Run 은 진행도 0 부터.
- **졸업시험**: 모든 챕터 통과 → `POST /runs/{id}/final` 로 자료 전체 범위 10문항(객관식+서술형) 시험. 불합격이면 다른 시험과 똑같이 LIFE −1, 다시 볼 수 있다.
- **졸업**: 모든 챕터 통과 + 졸업시험 통과 → `POST /runs/{id}/graduate`.
- **연습 모드**: ACTIVE Run 이 없는 자료에서 만든 세션(`runId` 없음). LIFE 영향 없음.

## 1. 에러 코드 (게임 확장)

| code | HTTP | 언제 |
|---|---|---|
| `RUN_ACTIVE` | 409 | 같은 자료에 ACTIVE Run 이 이미 있는데 `POST /runs` |
| `NOT_READY` | 409 | 통과 못 한 챕터·졸업시험이 남았거나, 이미 끝난(GAME_OVER) Run 에 `graduate`/`final`, 이미 통과했는데 `final` |
| `NO_RUN` | 404 | Run 이 없거나 남의 Run, 또는 세션이 그 Run 소속이 아님(연습 세션 포함) |

기존 코드(`NOT_FOUND`·`INVALID_STATE`·`VALIDATION`·`UNAUTHORIZED`·`LLM_FAILED`)도 그대로 쓴다.

## 2. 엔드포인트

### `POST /runs` — 후배 만나기
요청 `{ "materialId": "mat_x", "character": "KU_HARD", "maxLives": 3 }` (`maxLives` 는 3 또는 5, 생략 시 3)
응답 **201** `RunDto`. 오류: 자료 없음/남의 자료 404 `NOT_FOUND`, 목차 생성 전 409 `INVALID_STATE`, 중복 409 `RUN_ACTIVE`.

### `GET /runs/current?materialId=` — 지금 가르치는 후배
`materialId` 가 있으면 그 자료의 ACTIVE Run, 없으면 가장 최근에 갱신된 ACTIVE Run.
응답 `{ "run": RunDto | null }` — **없어도 200**(`run: null`).

### `GET /runs/{id}` → `RunDto`
상태와 상관없이(졸업·게임오버 포함) 조회된다. 남의 Run 404 `NO_RUN`.

`RunDto` 예시 (시드 체험1):
```json
{
  "runId": "run_v1bZE8f59ilFUH", "materialId": "mat_6y2w…", "materialTitle": "4장 프로세스 스케줄링", "courseName": "운영체제",
  "character": "KU_HARD", "lives": 2, "maxLives": 3, "passScore": 80, "examFormat": "DESCRIPTIVE",
  "status": "ACTIVE", "startedAt": "2026-09-26T10:00:00.000Z", "endedAt": null,
  "progress": { "cleared": 4, "total": 6, "chapters": [
    { "chapterId": "chp_Ibe…", "title": "프로세스와 스레드", "order": 1, "attempts": 2, "bestScore": 86, "cleared": true },
    { "chapterId": "chp_PqG…", "title": "라운드 로빈과 시간 할당량", "order": 4, "attempts": 0, "bestScore": null, "cleared": false }
  ] },
  "next": { "chapterId": "chp_PqG…", "title": "라운드 로빈과 시간 할당량" },
  "finalExam": { "status": "LOCKED", "sessionId": null, "bestScore": null, "attempts": 0, "questionCount": 10 },
  "canGraduate": false
}
```
- `progress.chapters` 는 자료의 모든 챕터(순서대로). `next` 는 첫 미통과 챕터(ACTIVE 가 아니면 null).
- 화면 표시는 Run 기록(`progress`)을 앞에, 사용자 기록(`GET /materials/{id}` 의 `taughtAt`·`bestScore`)은 보조로.

### `POST /sessions` 변경 (기존 엔드포인트)
- 자료에 ACTIVE Run 이 있으면 새 세션에 `runId` 를 연결하고 `juniorLevel` 을 후배 기준으로 **강제**한다(본문 `juniorLevel` 무시).
- Run 없으면 기존 그대로(연습 모드).
- Run 세션에 `PATCH /sessions/{id} {juniorLevel}` → 409 `INVALID_STATE`. (준비 화면의 쉽게/어렵게 토글은 Run 이 있으면 숨긴다)

### `GET /sessions/{id}/game` → `SessionGameDto`
헤더·결과 화면이 이 한 번으로 LIFE·합격선·시험 형식·판정 기록을 얻는다.
```json
{ "run": RunDto | null, "examFormat": "DESCRIPTIVE", "passScore": 80,
  "lifeEvent": { "outcome": "CLEAR", "delta": 0, "livesBefore": 2, "livesAfter": 2, "score": 94, "passScore": 80, "createdAt": "…" },
  "mastery": [] }
```
- 연습 세션: `run: null`, `passScore: null`, `examFormat: "DESCRIPTIVE"`.
- `lifeEvent` 는 이 세션에 LIFE 가 적용됐을 때만. `mastery` 는 KU 숙련도(P1, 지금은 빈 배열).
- `examFormat` 은 시험이 만들어졌으면 `Exam.format`, 아니면 후배 기준.

### `POST /runs/{id}/life` — 결과 판정 (결과 화면이 `result` SSE 직후 호출)
요청 `{ "sessionId": "sess_x" }` — 점수는 보내지 않는다.
응답 `ApplyLifeResponse`:
```json
{ "applied": true, "outcome": "FAILED", "score": 58, "passScore": 80,
  "livesBefore": 1, "livesAfter": 0, "maxLives": 3, "runStatus": "GAME_OVER",
  "chapter": { "cleared": false, "bestScore": 58, "firstClear": false }, "canGraduate": false }
```
- 같은 세션 재호출 → `applied: false` 와 처음과 같은 결과(새로고침 안전).
- Run 이 이미 끝났으면(GAME_OVER·GRADUATED) → `applied: false, outcome: "NONE"`, LIFE 변화 없음.
- 오류: 채점 전 세션(RESULT_READY/REVIEWING/COMPLETED 아님) 409 `INVALID_STATE` · 그 Run 소속이 아닌 세션 404 `NO_RUN`.
- 화면 분기: `runStatus === "GAME_OVER"` → `/runs/{id}/game-over`, `canGraduate` → "졸업하기" 노출, 그 외 `run.finalExam.status` READY/IN_PROGRESS → "졸업시험 보기".
- 졸업시험 세션이면 챕터 진행(ChapterProgress)은 바뀌지 않고, 합격 시 `chapter.cleared = true`(= 졸업시험 통과), `canGraduate = true`.
- 오버레이: `outcome` CLEAR / FAILED(`livesBefore`→`livesAfter`) / PERFECT(`livesAfter === livesBefore` 면 "이미 가득").

### `POST /runs/{id}/graduate` → `{ run, summary }`
```json
{ "run": RunDto(status "GRADUATED"),
  "summary": { "runId": "run_x", "character": "KU_HARD", "materialTitle": "4장 프로세스 스케줄링", "courseName": "운영체제",
               "days": 9, "chapters": 6, "exams": 7, "averageScore": 87, "perfectCount": 1, "wrongNoteCount": 0,
               "finalLives": 3, "maxLives": 3, "graduatedAt": "…" } }
```
- 통과 못 한 챕터가 있으면 409 `NOT_READY`("아직 통과하지 못한 챕터가 n개 있습니다."). GAME_OVER Run 도 409 `NOT_READY`.
- 재호출은 같은 요약을 돌려준다.
- GAME OVER 때도 같은 형식의 요약이 Run 에 저장된다(앨범 P2 용).

### `GET /materials/{id}/teacher-note` → `{ chapters: [{ chapterId, title, note | null }] }`
`note` = `{ chapterId, mustTeach[], keyTakeaways[], confusing[], likelyQuestions[] }`. 시드 자료는 ② fixture 가 있으면 미리 채워진다.

### `POST /materials/{id}/teacher-note` `{ chapterId }` → `TeacherNoteDto`
있으면 캐시를 돌려주고, 없으면 ② `llm.generateTeacherNote` 로 1회 생성·저장한다. ② 연결 전에는 502 `LLM_FAILED`("강의노트 생성 기능이 아직 연결되지 않았습니다.").
다른 자료의 챕터 404 `NOT_FOUND`.

### 오답노트 (P1) — 틀린 문항은 **자동 저장**

- 채점이 끝난 세션의 WRONG/PARTIAL 문항은 오답노트에 자동으로 들어간다(이유 `""`, `aiComparison: null`, 진단은 그 문항의 놓친 곳에서 즉시).
- 자동 저장 시점: `GET /sessions/{id}/result`, `POST /runs/{id}/life`(판정 직전), `GET /wrong-notes`(빠진 것 백필). 모두 멱등.
- 화면 흐름: 결과 화면에 "틀린 문항 n개 저장됨" → 오답노트 상세에서 선배가 **먼저 이유를 쓰면** AI 분석(비교·진단·놓친 개념·자료 문장)이 열린다 → [다시 가르치기].

#### `PATCH /wrong-notes/{id}` `{ userReason }` → `WrongNoteDto`
이유를 저장하고 `aiComparison` 을 만든다(② `llm.diagnoseWrongNote`, 없거나 실패하면 템플릿). 다시 보내면 이유와 비교가 갱신된다. 공백 400 `VALIDATION`.

#### `POST /wrong-notes` `{ sessionId, qid, userReason? }` → `WrongNoteDto`
수동 생성용(대부분 필요 없음). 없으면 201 로 만들고, 있으면 200 으로 기존 노트를 돌려준다. `userReason` 이 오면 비어 있을 때만 채운다.
- 오류: 채점 전 세션·맞힌 문항 409 `INVALID_STATE`, 없는 문항 404 `NOT_FOUND`.
```json
{ "wrongNoteId": "wn_x", "sessionId": "sess_x", "runId": "run_x", "qid": "q1",
  "courseName": "경제학원론", "materialTitle": "수요와 공급", "chapterId": "chp_x", "chapterTitle": "수요의 이해",
  "question": "수요 법칙은?", "choices": ["…", "…", "…", "…"], "answer": "① 가격이 오르면 수요량도 늘어납니다.",
  "score": 0, "maxScore": 34, "verdict": "WRONG",
  "userReason": "수요 법칙을 반대로 설명했다",
  "aiDiagnosis": "수요 법칙 방향이 반대. 새내기 답안은 …",
  "aiComparison": "맞아요. 선배가 짚은 수요 법칙 부분이 바로 새내기가 놓친 곳이에요. …",
  "evidenceQuote": "가격이 오르면 수요량도 늘어.", "sourceExcerpt": "가격이 오르면 수요량이 줄어든다.",
  "missedConcepts": ["수요 법칙"], "createdAt": "…" }
```

#### `GET /wrong-notes?materialId=` → `{ notes: WrongNoteDto[] }` (최신순, `materialId` 생략 시 전체)
#### `GET /wrong-notes/{id}` → `WrongNoteDto`
#### `POST /wrong-notes/{id}/reteach` → `{ sessionId, focusConcepts }` (201)
같은 챕터에 PREPARING 세션을 만든다(ACTIVE Run 이 있으면 연결). `focusConcepts` 는 `Session.focusConceptsJson` 에 저장되어 ② 의 prepare 가 "오늘의 재교육" 목표로 쓴다. 클라이언트는 `/session/{sessionId}/prepare` 로 이동.

### `GET /runs/album` → `{ graduated: AlbumEntry[], departed: AlbumEntry[] }` (P2)
`AlbumEntry` = `{ runId, character, status: "GRADUATED"|"GAME_OVER", materialId, materialTitle, courseName, startedAt, endedAt, summary: GraduationSummaryDto|null }` (최근 종료순).

### 객관식 보기 · 숙련도
- `SessionDto.exam.questions[].choices`, `ResultDto.items[].choices` — 객관식(`Exam.format = OBJECTIVE`)일 때만 4개.
- ② 가 `SessionRecord.game.mastery` 를 채워 커밋하면 `ConceptMastery` 에 저장되고 `GET /sessions/{id}/game` 의 `mastery` 로 나온다(KU, P1).

### `POST /runs/{id}/final` → `{ sessionId, created }` — 졸업시험
- 조건: ACTIVE · 모든 챕터 통과 · 아직 졸업시험 미통과. 아니면 409 `NOT_READY`.
- 진행 중(PREPARING~EVALUATING) 졸업시험이 있으면 그 세션(`created: false`, 200), 없으면 새로 만든다(201).
- 새 세션: `kind = FINAL`, 마지막 챕터에 붙고, 이 Run 의 챕터 세션에서 선배가 가르친 설명(USER, 제외되지 않은 것, 최근 80개)을 그대로 옮겨 담는다 → 후배는 지금까지 배운 것으로 시험을 본다.
- ② 에는 자료 전체 본문(최대 16,000자)·제목 "<자료> 졸업시험"·포인트 = 챕터 제목들이 넘어가고 `game = { kind: "FINAL", examFormat: "MIXED", questionCount: 10 }`.
- `RunDto.finalExam.status`: `LOCKED`(챕터 남음) · `READY` · `IN_PROGRESS` · `PASSED`. `bestScore`/`attempts` 는 채점된 졸업시험 기준.
- 자료 화면의 챕터 행동(START/CONTINUE/RETRY)·홈 진행 목록에는 졸업시험 세션이 끼지 않는다.

## 3. 시드 계정 (`pnpm db:reset`)

| 계정 | 자료 | 후배 | 상태 | 데모 |
|---|---|---|---|---|
| 체험 1 `usr_demo1` | 운영체제 + 경제학원론 | KU (운영체제) | ♥♥♡, 4/6 통과, 다음 = 라운드 로빈(진행 중 세션) | 평상시 흐름 |
| 체험 2 `usr_demo2` | 경제학원론 | KU | ♥♡♡, 0/5 통과 | Scene 3→4→6: 한 번 실패하면 GAME OVER |
| 체험 3 `usr_demo3` | 운영체제 | KU | ♥♥♥, 6/6 통과(챕터별 완료 세션·가르친 설명 포함), 졸업시험 READY | Scene 7: "졸업시험 보기" → 통과하면 "졸업하기" |

체험1 경제학원론에는 Run 이 없다(후배 선택 화면 시연용).

## 4. 검증

```bash
pnpm db:reset && pnpm dev            # 다른 터미널 (db:reset 뒤에는 dev 서버를 재시작)
pnpm tsx scripts/smoke-api.ts        # 276 체크 (기존 + 게임·졸업시험)
```
