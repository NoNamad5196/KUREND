# C 백엔드 메모 — DB · CRUD API · 인증 · 인제스트

> 설계서 §3·§5 를 그대로 구현한 C 영역의 사용법과, 구현 중 정한 세부 규칙. D(LLM 라우트)와 A/B(프런트)가 참고한다.

## 1. 실행

```bash
pnpm install          # postinstall: prisma generate → src/generated/prisma (git 제외)
cp .env.example .env  # DATABASE_URL="file:./prisma/dev.db"  (프로젝트 루트 기준 상대경로)
pnpm db:reset         # prisma/dev.db 삭제 → prisma db push → tsx prisma/seed.ts
pnpm dev
pnpm tsx scripts/smoke-api.ts   # (dev 서버 켠 뒤) §5-2~5-5 전부 호출 + contracts zod 검증
```

- Prisma 7 이라 `schema.prisma` 에 `url` 이 없다. 연결 문자열은 `prisma.config.ts`(CLI)와 `src/lib/server/db.ts`(런타임)가 같은 규칙으로 읽는다. `.env` 가 없어도 기본값 `file:./prisma/dev.db` 로 동작.
- SQLite driver adapter 는 `@prisma/adapter-libsql` (네이티브 빌드 스크립트 없음). 루트 `@libsql/client` 는 어댑터와 같은 `^0.17.x` 여야 Next 가 외부화한다(다른 버전이면 빌드가 깨짐 — 올리지 말 것).
- `pdf-parse` 는 webpack 번들에서 깨져서 `ingest.ts` 가 번들러를 우회해 로드한다. A 가 `next.config.ts` 에 `serverExternalPackages: ["pdf-parse"]` 를 넣으면 우회 코드는 지워도 된다.

## 2. 시드 데이터 (`pnpm db:seed`, 멱등 — 전체 테이블을 비우고 다시 넣음)

| 계정 | 내용 |
|---|---|
| `usr_demo1` 체험 1 | 자료 2개 READY: 운영체제 "4장 프로세스 스케줄링"(시험 D-7, 챕터 6) · 경제학원론 "수요와 공급"(D-12, 챕터 5) / 완료 세션 1개(어제, 94점 MOSTLY, 놓친 곳 1 + 튜터 메시지) / 진행 중 세션 1개(EXPLAINING, 메시지 4개, Exam READY) |
| `usr_demo2` 체험 2, `usr_demo3` 체험 3 | 빈 계정 |

원본은 `prisma/seed-data/{materials.json, sessions.json, *.md}`. D 가 `fixtures/seed-data/` 에 같은 형식을 두면 그쪽을 우선한다(`SEED_DATA_DIR` 로 강제 지정 가능). 챕터 범위는 문단 인덱스(`startPara`/`endPara`, 빈 줄 기준)로 적고 시드가 char offset 으로 바꾼다.

## 3. D 가 import 하는 것 (`src/lib/server/`)

```ts
import { db } from "@/lib/server/db";                                  // Prisma 싱글턴
import { requireUser } from "@/lib/server/auth";                       // (req) → { userId, nickname } | 401 throw
import { loadOwnedSession, assertStatus } from "@/lib/server/session-access";
import { sessionInclude, toSessionDto, toResultDto, toGapDto } from "@/lib/server/session-dto";
import { ApiError, invalidState, notFound, validation, toErrorResponse, withApi, parseJson, json } from "@/lib/server/http";
import { newId, examItemId } from "@/lib/server/ids";                  // newId("msg"), examItemId(examId, "q1")
import { parseObjectives, parseStringArray, parseSentences, toJson } from "@/lib/server/json-fields";
```

- `const { user, session } = await loadOwnedSession(req, id)` — 소유자가 아니면 404 `ApiError`. `session` 은 `sessionInclude` 로 chapter(+material)·messages·exam(questions/answers/grades)·gaps(+tutorMessages) 가 다 실려 있다.
- `assertStatus(session, ["EXPLAINING"], "설명")` — 아니면 409 `INVALID_STATE` throw. SSE 라우트는 try/catch 로 받아 `event: error` 로 보내면 된다 (`err instanceof ApiError` → `err.code`, `err.message`).
- `ready` 이벤트의 `session` 은 `toSessionDto(await db.session.findFirstOrThrow({ where: { id }, include: sessionInclude }))`.
- `gap` 이벤트는 `toGapDto(gapRow)` (gap 은 `include: { tutorMessages: true }` 로 읽어야 함). 평가 뒤 `Session.score`/`finalVerdict` 는 D 가 저장한다(`finalVerdictFor` 는 `@/contracts/types`).
- 메시지 순서는 `createdAt` 오름차순. 한 턴에 여러 메시지를 저장할 때는 createdAt 을 1ms 씩이라도 다르게 주거나 순서대로 `await` 하면 된다.
- 사용자 설명(taught) 수집: `session.messages.filter(m => m.role === "USER" && !m.excluded)` 를 순서대로 1-base `ref` 로.

## 4. 상태 전이 (C 담당 라우트)

| 라우트 | 허용 상태 | 결과 |
|---|---|---|
| `POST /sessions` | 자료 READY 의 내 챕터 | PREPARING (`{sessionId}`, 201) |
| `PATCH /sessions/{id}` `{juniorLevel}` | EXPLAINING | 세션 객체 |
| `POST …/finish-explanation` | EXPLAINING (USER 메시지 1개 이상, 아니면 409 `NO_EXPLANATION`) | phase EXAM_READY (이미 EXAM_READY 면 그대로 200) |
| `POST …/start-exam` | EXPLAINING + EXAM_READY + Exam READY | EXAM_IN_PROGRESS, Exam IN_PROGRESS |
| `GET …/result` | RESULT_READY / REVIEWING / COMPLETED | §5-5-2 |
| `POST …/gaps/{gapId}/reviewed` | RESULT_READY / REVIEWING | gap REVIEWED, 세션 REVIEWING, `remaining` = 아직 FOUND 인 수 (멱등) |
| `POST …/complete` | RESULT_READY / REVIEWING | COMPLETED, `Chapter.taughtAt` 최초 세팅, **gap 이 하나도 없을 때만** `stableAt` |
| `POST …/messages/{mid}/exclude` | EXPLAINING, 내 USER 메시지 | `excluded=true` |

- `stableAt` 규칙: 설계서 §3 "놓친 곳 0으로 COMPLETED" 를 **총 gap 0개**로 해석했다(되짚기로 전부 REVIEWED 해도 ★ 안정은 아님 — 다시 가르쳐서 0개여야 함). B mock 이 "open gap 0" 로 돼 있다면 맞춰야 한다.
- `GET /materials/{id}` 의 챕터: `action` 은 진행 중 세션(COMPLETED/FAILED 아님) 있으면 `CONTINUE`(최신), 완료 세션만 있으면 `RETRY`, 없으면 `START`. `bestScore` = 완료 세션 최고점, `openGapCount` = 가장 최근 완료 세션의 FOUND gap 수.
- `GET /home`: 과목은 시험일이 가까운 순, `resume` 은 자료 안에서 가장 최근에 갱신된 진행 중 세션, `recentSessions` 는 상태 무관 최근 5개, `streakDays` 는 완료 세션이 있는 날이 오늘(또는 어제)부터 끊기지 않은 일수.
- 날짜: `examDate` 는 `YYYY-MM-DD` 문자열로 주고받고(DB 에는 로컬 자정), 나머지는 ISO 8601.
- 오류 형식: `{ error: { code, message } }` — 400 `VALIDATION`, 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 409 `INVALID_STATE`/`NO_EXPLANATION`, 500 `INTERNAL`.
