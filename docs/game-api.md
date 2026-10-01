# KUREND 게임 API (① 게임 코어)

> 타입·zod 정본은 `src/contracts/game.ts`. 클라이언트는 `src/lib/client/game-api.ts`(③).
> base `/api`, 인증 쿠키 `tb_uid`. 오류 형식은 기존과 같다: `{ "error": { "code", "message" } }`.

## 0. 룰 요약

| 후배 | `character` | 난이도 표시 | 세션 `juniorLevel` | 시험 형식 | 합격선 |
|---|---|---|---|---|---|
| 남학생 | `MALE_EASY` | EASY | EASY | `OBJECTIVE`(객관식 4지선다) | 60 |
| 여학생 | `FEMALE_NORMAL` | NORMAL | EASY | `DESCRIPTIVE` | 70 |
| KU | `KU_HARD` | HARD | HARD | `DESCRIPTIVE`(+응용) | 80 |

- **Run** = 사용자 × 자료 × 후배. 자료당 `ACTIVE` Run 은 최대 1개.
- **LIFE**: 기본 3(생성 시 5 선택). 시험 1회 = 판정 1회.
  - `score < 합격선` → `FAILED` −1
  - `score == 100` → `PERFECT` +1 (이미 가득이면 0)
  - 그 외 → `CLEAR` 0
  - 세션당 1회만 적용된다(멱등). 점수는 서버의 `Session.score` 만 쓴다.
- **챕터 통과**: 이 Run 에서의 최고점 ≥ 합격선.
- **GAME OVER**: LIFE 0 이 되는 순간. 자료·세션·`Chapter.taughtAt/stableAt` 은 남고, 새 Run 은 진행도 0 부터.
- **졸업**(P0): 자료의 모든 챕터 통과 → `POST /runs/{id}/graduate`.
- **연습 모드**: ACTIVE Run 이 없는 자료에서 만든 세션(`runId` 없음). LIFE 영향 없음.

## 1. 에러 코드 (게임 확장)

| code | HTTP | 언제 |
|---|---|---|
| `RUN_ACTIVE` | 409 | 같은 자료에 ACTIVE Run 이 이미 있는데 `POST /runs` |
| `NOT_READY` | 409 | 통과 못 한 챕터가 남았거나, 이미 끝난(GAME_OVER) Run 에 `graduate` |
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
- 화면 분기: `runStatus === "GAME_OVER"` → `/runs/{id}/game-over`, `canGraduate` → "졸업하기" 노출.
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

### 오답노트 (P1)

#### `POST /wrong-notes` `{ sessionId, qid, userReason }` → `WrongNoteDto` (201)
- 사용자가 **먼저** 이유를 쓰고, 저장되면 AI 분석이 함께 돌아온다(화면은 저장 후에 분석을 공개).
- 같은 (세션, 문항) 재요청은 처음 노트를 **200** 으로 돌려준다(덮어쓰지 않음).
- 오류: 채점 전 세션·맞힌 문항 409 `INVALID_STATE`, 없는 문항 404 `NOT_FOUND`, 이유 공백 400 `VALIDATION`.
```json
{ "wrongNoteId": "wn_x", "sessionId": "sess_x", "runId": "run_x", "qid": "q1",
  "courseName": "경제학원론", "materialTitle": "수요와 공급", "chapterId": "chp_x", "chapterTitle": "수요의 이해",
  "question": "수요 법칙은?", "choices": ["…", "…", "…", "…"], "answer": "① 가격이 오르면 수요량도 늘어납니다.",
  "score": 0, "maxScore": 34, "verdict": "WRONG",
  "userReason": "수요 법칙을 반대로 설명했다",
  "aiDiagnosis": "수요 법칙 방향이 반대. 새내기 답안은 …",
  "aiComparison": "맞아요. 선배가 짚은 대로 수요 법칙을(를) 새내기에게 가르치지 않은 것이 원인이에요. …",
  "evidenceQuote": "가격이 오르면 수요량도 늘어.", "sourceExcerpt": "가격이 오르면 수요량이 줄어든다.",
  "missedConcepts": ["수요 법칙"], "createdAt": "…" }
```
- `aiDiagnosis` 는 그 문항의 놓친 곳(Gap)에서 바로 만든다(대기 없음). `choices` 는 객관식일 때만.
- `aiComparison` 은 ② `llm.diagnoseWrongNote` 가 있으면 그 결과, 없거나 실패하면 템플릿 문구.

#### `GET /wrong-notes?materialId=` → `{ notes: WrongNoteDto[] }` (최신순, `materialId` 생략 시 전체)
#### `GET /wrong-notes/{id}` → `WrongNoteDto`
#### `POST /wrong-notes/{id}/reteach` → `{ sessionId, focusConcepts }` (201)
같은 챕터에 PREPARING 세션을 만든다(ACTIVE Run 이 있으면 연결). `focusConcepts` 는 `Session.focusConceptsJson` 에 저장되어 ② 의 prepare 가 "오늘의 재교육" 목표로 쓴다. 클라이언트는 `/session/{sessionId}/prepare` 로 이동.

### `GET /runs/album` → `{ graduated: AlbumEntry[], departed: AlbumEntry[] }` (P2)
`AlbumEntry` = `{ runId, character, status: "GRADUATED"|"GAME_OVER", materialId, materialTitle, courseName, startedAt, endedAt, summary: GraduationSummaryDto|null }` (최근 종료순).

### 객관식 보기 · 숙련도
- `SessionDto.exam.questions[].choices`, `ResultDto.items[].choices` — 객관식(`Exam.format = OBJECTIVE`)일 때만 4개.
- ② 가 `SessionRecord.game.mastery` 를 채워 커밋하면 `ConceptMastery` 에 저장되고 `GET /sessions/{id}/game` 의 `mastery` 로 나온다(KU, P1).

### 남은 것: 졸업시험(`Session.kind = FINAL`, P1 #13) — ② 의 FINAL 출제와 함께 진행.

## 3. 시드 계정 (`pnpm db:reset`)

| 계정 | 자료 | 후배 | 상태 | 데모 |
|---|---|---|---|---|
| 체험 1 `usr_demo1` | 운영체제 + 경제학원론 | KU (운영체제) | ♥♥♡, 4/6 통과, 다음 = 라운드 로빈(진행 중 세션) | 평상시 흐름 |
| 체험 2 `usr_demo2` | 경제학원론 | KU | ♥♡♡, 0/5 통과 | Scene 3→4→6: 한 번 실패하면 GAME OVER |
| 체험 3 `usr_demo3` | 운영체제 | KU | ♥♥♥, 6/6 통과 | Scene 7: 바로 "졸업하기" |

체험1 경제학원론에는 Run 이 없다(후배 선택 화면 시연용).

## 4. 검증

```bash
pnpm db:reset && pnpm dev            # 다른 터미널 (db:reset 뒤에는 dev 서버를 재시작)
pnpm tsx scripts/smoke-api.ts        # 245 체크 (기존 + 게임 96개)
```
