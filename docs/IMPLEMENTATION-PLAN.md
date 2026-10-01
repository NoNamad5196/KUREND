# 새내기(TeachBack Campus) 구현 설계서

> 해커톤: 2026 제1회 컴퓨터공학과 해커톤 L/NKerthon (10/1~10/2) · 주제 "우리가 바꾸는 캠퍼스의 하루"
> 팀 4명 · 각자 AI 코딩 도구로 구현 · GitHub 푸시 · **작업 영역 완전 분리**
> 이 문서는 AI에게 그대로 붙여 넣는 용도로 작성됨. 본문의 계약(타입·API·SSE·DB)은 **고정(FROZEN)** 이며 변경은 팀 합의 후 소유자만 수정한다.

---

## 0. 한 장 요약

| 항목 | 내용 |
|---|---|
| 서비스명(가칭) | **새내기** — "가르쳐야 아는 AI 새내기에게 전공을 가르쳐라" (영문 코드명 `teachback-campus`) |
| 한 줄 | 강의자료를 올리면 AI가 목차로 나누고, 사용자(선배)가 **아무것도 모르는 AI 새내기**에게 설명한다. 새내기는 **들은 것만으로** 혼자 시험을 보고, 채점 결과의 틀린 곳 = 내 설명에서 빠진 곳을 되짚는다. |
| 캠퍼스 변주 | 과목(Course) 단위 관리 + 시험 D-day, 교수 PDF/강의노트 업로드, 설명 중 **즉시 되묻기(소크라틱 체크)** — 자료와 모순된 설명이면 새내기가 바로 의심 질문 |
| 원본 대비 차별점 | 원본(다들 AI)은 틀린 설명을 그대로 받아쓰고 시험에서만 걸러짐. 우리는 **설명 즉시 자료 대조 → 모순이면 되묻기** (정답은 알려주지 않음) |
| 스택 | Next.js 15 App Router + TypeScript + Tailwind · Prisma + SQLite(로컬 파일 DB) · LLM API(OpenAI 기본, Anthropic 전환 가능) · SSE over POST |
| P0 루프 | 데모 로그인 → 자료 업로드 → 목차 생성 → 세션 준비 → 가르치기(채팅) → 새내기 혼자 시험(관전) → 채점+놓친 곳 → 되짚기(튜터) → 완료 판정 |
| 컷 | 코넬 노트 공부 모드, 그룹 라운드, 업적, 음성 입력, 카카오 로그인, 회원가입, 지식 지도(P1로만) |
| 팀 분할 | **A** 앱 셸·자료 화면(FE) / **B** 세션 화면 전부(FE) / **C** DB·CRUD API·인증·인제스트(BE) / **D** LLM 파이프라인·스트리밍 라우트(BE) |

---

## 1. 작업 분리 원칙 (충돌 방지)

### 1-1. 디렉터리 소유권 (다른 사람 영역은 절대 수정 금지)

```
teachback-campus/
├─ src/
│  ├─ contracts/                 ← [A가 T+0에 생성, 이후 FROZEN] 타입·zod·SSE 이벤트·fixture 타입
│  │   ├─ types.ts                  모든 도메인 타입 + zod 스키마
│  │   ├─ events.ts                 SSE 이벤트 타입
│  │   └─ api.md                    엔드포인트 요약 (이 문서 §5 복사)
│  ├─ app/
│  │   ├─ layout.tsx, globals.css, page.tsx(홈)            [A]
│  │   ├─ login/                                            [A]
│  │   ├─ new/                                              [A]
│  │   ├─ materials/[id]/                                   [A]
│  │   ├─ map/                        (P1)                  [A]
│  │   ├─ session/[id]/prepare|teach|exam|result|review|complete/   [B]
│  │   └─ api/
│  │       ├─ auth/**                                       [C]
│  │       ├─ home/route.ts                                 [C]
│  │       ├─ materials/route.ts, materials/[id]/route.ts   [C]
│  │       ├─ materials/[id]/generate/route.ts              [D]  ← LLM 스트리밍
│  │       ├─ sources/**                                    [C]
│  │       ├─ sessions/route.ts, sessions/[id]/route.ts     [C]
│  │       ├─ sessions/[id]/(finish-explanation|start-exam|complete|result|gaps/**|messages/**)/route.ts   [C]
│  │       ├─ sessions/[id]/(prepare|explanations|exam/answers|evaluate|tutor)/route.ts                  [D]  ← LLM 스트리밍
│  │       └─ mock/**                                       [B]  ← B의 프런트 개발용 가짜 API
│  ├─ components/
│  │   ├─ shell/**  (사이드바, 헤더, 카드, 버튼 등 공통 UI)  [A]
│  │   ├─ material/**                                       [A]
│  │   ├─ session/**                                        [B]
│  │   ├─ exam/**                                           [B]
│  │   └─ mascot/**                                         [B]
│  ├─ lib/
│  │   ├─ client/api.ts   (fetch 래퍼 + SSE 리더)          [A, T+2h까지 커밋 후 FROZEN]
│  │   ├─ server/db.ts    (Prisma 싱글턴)                   [C]
│  │   ├─ server/auth.ts  (쿠키 → userId)                   [C]
│  │   ├─ server/ingest.ts(PDF/MD/TXT 파싱)                 [C]
│  │   ├─ server/sse.ts   (SSE 응답 헬퍼)                   [D]
│  │   └─ llm/**          (provider, prompts, schemas, stub)[D]
│  └─ mocks/**            (B 전용 fixture JSON)             [B]
├─ prisma/schema.prisma, prisma/seed.ts                    [C]
├─ fixtures/               (데모 자료 md, 골든 테스트)       [D]
├─ scripts/eval-llm.ts                                      [D]
├─ public/                 (폰트·이미지)                     [A]  (마스코트 SVG는 B가 components/mascot 안에 인라인)
└─ package.json, tsconfig, tailwind.config, .env.example    [A가 스켈레톤에서 생성]
```

### 1-2. 공유 파일 규칙
- `package.json` / `pnpm-lock.yaml`: A가 스켈레톤 커밋에서 **아래 §2-2의 의존성을 전부 미리 설치**. 추가가 꼭 필요하면 `chore(deps): add xxx` 한 줄 커밋을 main에 직접 올리고 알린다. 기능 PR에 deps 변경을 섞지 않는다.
- `src/contracts/**`, `prisma/schema.prisma`, `lib/client/api.ts`, `lib/server/db.ts`, `lib/llm/index.ts`(시그니처): **FROZEN**. 바꿔야 하면 팀 채팅에 "계약 변경 제안"을 올리고 소유자가 수정·커밋한다.
- 다른 사람 영역의 함수가 필요하면 **import만** 한다. 없으면 자기 영역에 임시 stub를 두고 TODO를 남긴다.

### 1-3. Git 워크플로
```
main            ← 통합 브랜치. 직접 푸시는 A의 스켈레톤 커밋과 deps 커밋만.
feat/a-shell    ← A
feat/b-session  ← B
feat/c-data     ← C
feat/d-llm      ← D
```
- 각자 자기 브랜치에만 푸시. 2~3시간마다 `git pull --rebase origin main` 후 PR → 셀프 머지(소유 영역만 바뀌었으면 리뷰 생략).
- 충돌이 나면 **내 영역 밖 파일은 무조건 main 버전을 택한다**.
- 커밋 메시지: `feat(a): ...` `feat(b): ...` `feat(c): ...` `feat(d): ...` `fix(x): ...` `chore(deps): ...`

### 1-4. 통합 체크포인트 (T = 킥오프 시각)
| 시각 | 머지되어야 하는 것 | 확인 방법 |
|---|---|---|
| T+0.5h | A: 스켈레톤 + contracts + globals.css + deps | `pnpm dev` 뜸, `/`에 사이드바 |
| T+2h | A: `lib/client/api.ts` · C: schema+db+seed+auth · D: `lib/llm/index.ts` 시그니처+stub · B: mock 라우트 | 각자 브랜치에서 `pnpm build` 통과 |
| T+6h | C: materials CRUD+ingest · D: generate SSE · A: /new, /materials 화면 | **업로드→목차 생성** 실제 동작 |
| T+10h | D: prepare+explanations · B: prepare/teach 화면 | **가르치기 채팅** 실제 LLM으로 동작 |
| T+14h | D: exam answers+evaluate+tutor · B: exam/result/review/complete · C: 상태 전이 API | **전체 루프** 1회 완주 |
| T+16h | 데모 시나리오 리허설 3회, stub 세이프 모드 확인, README | 발표 준비 |

---

## 2. 기술 스택 & 프로젝트 설정

### 2-1. 선택 이유
- **Next.js App Router 단일 앱**: FE/BE 한 레포, Route Handler로 SSE 스트리밍 쉬움, 배포 없이 노트북에서 데모.
- **Prisma + SQLite**: 설치 0, 파일 하나(`prisma/dev.db`). Postgres(Supabase)로 바꾸려면 `provider`만 변경. SQLite라 `Json` 타입 대신 **String에 JSON 문자열** 저장.
- **SSE over POST**: 원본과 동일. 클라이언트는 `fetch` + `ReadableStream` 리더로 파싱(EventSource는 POST 불가).
- **LLM 추상화**: `lib/llm/provider.ts` 한 곳에서만 공급자를 호출. `LLM_PROVIDER=openai|anthropic|stub`. `stub`은 fixture를 돌려주는 **데모 세이프 모드**.

### 2-2. 스켈레톤 명령 (A가 T+0에 실행)
```bash
pnpm create next-app@latest teachback-campus --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
cd teachback-campus
pnpm add prisma @prisma/client zod pdf-parse openai @anthropic-ai/sdk nanoid date-fns clsx
pnpm add -D tsx @types/pdf-parse
pnpm prisma init --datasource-provider sqlite
```
`.env.example`
```
DATABASE_URL="file:./dev.db"
LLM_PROVIDER=openai          # openai | anthropic | stub
LLM_MODEL=                   # 팀이 쓰는 모델 ID (비우면 provider 기본값)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_API_BASE=/api    # B는 로컬에서 /api/mock 으로 바꿔 개발
SESSION_COOKIE=tb_uid
```
`package.json` scripts
```json
{ "dev": "next dev", "build": "next build", "start": "next start",
  "db:push": "prisma db push", "db:seed": "tsx prisma/seed.ts", "db:reset": "rm -f prisma/dev.db && prisma db push && tsx prisma/seed.ts",
  "eval:llm": "tsx scripts/eval-llm.ts" }
```

### 2-3. ID 규칙
`nanoid(14)`에 접두사: `usr_` `mat_` `src_` `chp_` `sess_` `msg_` `exam_` `q1..qN`(문항은 시험 내 로컬 id) `gap_` `tm_`.

---

## 3. 도메인 & DB 스키마 (C 소유, FROZEN)

`prisma/schema.prisma`
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model User {
  id        String   @id            // usr_
  nickname  String
  createdAt DateTime @default(now())
  materials Material[]
  sessions  Session[]
}

model Material {
  id          String   @id          // mat_
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  courseName  String                // 캠퍼스 변주: 과목명 (예: "운영체제")
  examDate    DateTime?             // 시험일 → 홈에서 D-day
  title       String                // LLM이 지은 자료 제목 (생성 전엔 "새 자료")
  status      String   @default("PENDING") // PENDING | READY | FAILED
  error       String?
  createdAt   DateTime @default(now())
  sources     Source[]
  chapters    Chapter[]
}

model Source {
  id         String   @id          // src_
  materialId String
  material   Material @relation(fields: [materialId], references: [id], onDelete: Cascade)
  kind       String                // MD | TXT | PDF
  fileName   String
  text       String                // 추출된 전체 텍스트
  charCount  Int
  chapters   Chapter[]
}

model Chapter {
  id          String   @id         // chp_
  materialId  String
  material    Material @relation(fields: [materialId], references: [id], onDelete: Cascade)
  order       Int
  title       String
  pointsJson  String               // string[] JSON  (핵심 포인트 2~4개)
  sourceId    String
  source      Source   @relation(fields: [sourceId], references: [id])
  startOffset Int                  // source.text 내 char 범위
  endOffset   Int
  taughtAt    DateTime?            // 첫 COMPLETED 세션 시각 ("가르침" 달걀)
  stableAt    DateTime?            // 놓친 곳 0으로 COMPLETED 시각 ("안정")
  sessions    Session[]
}

model Session {
  id             String   @id      // sess_
  userId         String
  user           User     @relation(fields: [userId], references: [id])
  chapterId      String
  chapter        Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  status         String   @default("PREPARING") // PREPARING | EXPLAINING | EXAM_IN_PROGRESS | EVALUATING | RESULT_READY | REVIEWING | COMPLETED | FAILED
  phase          String   @default("QUESTION")  // QUESTION | EXAM_READY  (EXPLAINING 내부 단계)
  juniorLevel    String   @default("EASY")      // EASY | HARD
  objectivesJson String   @default("[]")        // [{id:"o1", text}]
  heardJson      String   @default("[]")        // string[] 들은 개념
  score          Int?
  finalVerdict   String?                         // NEEDS_WORK | MOSTLY | STABLE
  error          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  completedAt    DateTime?
  messages       Message[]
  exam           Exam?
  gaps           Gap[]
  tutorMessages  TutorMessage[]
}

model Message {
  id        String   @id          // msg_
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role      String                // USER | JUNIOR
  stage     String                // QUESTION | ANSWER | REACTION | DOUBT
  content   String
  excluded  Boolean  @default(false)   // 사용자가 "이 설명 빼기" 한 경우(P1)
  createdAt DateTime @default(now())
}

model Exam {
  id        String   @id          // exam_
  sessionId String   @unique
  session   Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  status    String   @default("READY") // READY | IN_PROGRESS | EVALUATING | GRADED
  createdAt DateTime @default(now())
  questions ExamQuestion[]
  answers   ExamAnswer[]
  grades    Grade[]
}

model ExamQuestion {
  id           String @id         // "q1".."q3" 는 시험 내 로컬 id → 전역 id는 `${examId}:${qid}`
  examId       String
  exam         Exam   @relation(fields: [examId], references: [id], onDelete: Cascade)
  qid          String             // q1
  order        Int
  points       Int                // 34/33/33
  question     String
  objectiveRef String             // o1 | o2 | o3
  rubric       String             // 채점 기준 (사용자에게 비공개)
}

model ExamAnswer {
  id            String @id        // `${examId}:${qid}`
  examId        String
  exam          Exam   @relation(fields: [examId], references: [id], onDelete: Cascade)
  qid           String
  answer        String
  sentencesJson String            // [{sentence, ref, level:"STRONG"|"FAINT"|"NONE", unlearned}]
  createdAt     DateTime @default(now())
}

model Grade {
  id       String @id             // `${examId}:${qid}`
  examId   String
  exam     Exam   @relation(fields: [examId], references: [id], onDelete: Cascade)
  qid      String
  score    Int
  maxScore Int
  verdict  String                 // CORRECT | PARTIAL | WRONG
  comment  String
}

model Gap {
  id            String   @id      // gap_
  sessionId     String
  session       Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  qid           String
  title         String
  diagnosis     String
  evidenceQuote String             // 원인이 된 내 설명 (없으면 "")
  conceptsJson  String             // string[]
  sourceExcerpt String             // 원자료 발췌
  sourceOffset  Int?
  status        String   @default("FOUND") // FOUND | REVIEWED
  createdAt     DateTime @default(now())
  tutorMessages TutorMessage[]
}

model TutorMessage {
  id        String   @id          // tm_
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  gapId     String
  gap       Gap      @relation(fields: [gapId], references: [id], onDelete: Cascade)
  request   String
  response  String
  createdAt DateTime @default(now())
}
```

### 3-1. 시드 (C) — `prisma/seed.ts`
- 데모 계정 3개: `usr_demo1`(체험 1), `usr_demo2`, `usr_demo3`
- `usr_demo1`에 fixture 자료 2개 **READY 상태로** 미리 넣기(D가 `fixtures/*.md`와 `fixtures/chapters.*.json` 제공): "운영체제 4장 프로세스 스케줄링"(과목 운영체제, 시험일 +7일), "경제학원론 수요·공급"(과목 경제학원론, 시험일 +12일)
- 완료된 세션 1개(점수 94, 놓친 곳 1개)도 fixture로 넣어 홈/결과 화면이 처음부터 차 보이게

---

## 4. 세션 상태 머신 (전원 공통)

```
POST /api/sessions ──▶ PREPARING
  GET /prepare(SSE, D) 완료 ──▶ EXPLAINING / phase QUESTION
  POST /explanations(SSE, D) 반복 (사용자 설명 ↔ 새내기 반응·되묻기·다음 질문)
  POST /finish-explanation(C) ──▶ EXPLAINING / phase EXAM_READY
  POST /start-exam(C) ──▶ EXAM_IN_PROGRESS   (Exam.status IN_PROGRESS)
  POST /exam/answers(SSE, D) 문항별 ×3, 마지막에 exam.completed
  POST /evaluate(SSE, D) ──▶ EVALUATING ──(스트림 끝)──▶ RESULT_READY  (Exam.status GRADED, Gap 생성, Session.score/finalVerdict 저장)
  POST /gaps/{gapId}/reviewed(C) ──▶ (status REVIEWING; 모든 gap REVIEWED 되면 complete 가능)
  POST /complete(C) ──▶ COMPLETED  (Chapter.taughtAt 세팅, gap 0개면 stableAt)
```
- `finalVerdict` 규칙(D가 evaluate에서 계산): 총점 ≥ 90 && gap 0 → `STABLE`, 총점 ≥ 70 → `MOSTLY`, 그 외 `NEEDS_WORK`
- 사용자는 RESULT_READY에서 `complete`로 바로 갈 수도 있다(놓친 곳을 남기고 끝내기).
- 모든 상태 전이는 **서버가 현재 상태를 검증**하고 틀리면 `409 {code:"INVALID_STATE"}`.

---

## 5. API 계약 (FROZEN) — base `/api`, 모든 응답 JSON, 인증은 쿠키 `tb_uid`

### 5-1. 공통
- 성공: 그대로 객체/배열. 실패: `{ "error": { "code": "NOT_FOUND"|"INVALID_STATE"|"UNAUTHORIZED"|"VALIDATION"|"LLM_FAILED", "message": "..." } }` + HTTP 404/409/401/400/502
- 인증 없으면 401. `lib/server/auth.ts`의 `requireUser(req)` 사용(C 소유, D는 import).

### 5-2. 인증 [C]
| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| GET | `/auth/demo-accounts` | – | `[{userId, nickname}]` |
| POST | `/auth/demo-login` | `{userId}` | `{ok:true}` + Set-Cookie `tb_uid` |
| GET | `/auth/me` | – | `{userId, nickname, streakDays}` |
| POST | `/auth/logout` | – | `{ok:true}` |

### 5-3. 홈 [C]
`GET /home` →
```json
{ "userName": "체험 1",
  "courses": [ { "courseName": "운영체제", "examDate": "2026-10-08", "dDay": 7,
      "materials": [ { "materialId": "mat_x", "title": "4장 프로세스 스케줄링", "chapterCount": 6, "taughtCount": 2,
                       "resume": { "sessionId": "sess_x", "chapterTitle": "CPU 스케줄링 알고리즘", "status": "EXPLAINING", "stageLabel": "가르치는 중" } } ] } ],
  "recentSessions": [ { "sessionId": "sess_y", "chapterTitle": "...", "materialTitle": "...", "status": "COMPLETED", "score": 94, "finalVerdict": "MOSTLY", "updatedAt": "ISO" } ],
  "stats": { "completedSessions": 3, "averageScore": 81, "streakDays": 2 } }
```
`stageLabel` 매핑: PREPARING→"준비 중", EXPLAINING→"가르치는 중", EXAM_IN_PROGRESS→"시험 중", EVALUATING→"채점 중", RESULT_READY/REVIEWING→"되짚기", COMPLETED→"완료"

### 5-4. 자료 [C], 목차 생성 [D]
| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/materials` | multipart: `files[]`(md/txt/pdf, 최대 5개·각 10MB), `courseName`, `examDate?` | `{materialId, status:"PENDING", sources:[{sourceId,kind,fileName,charCount}]}` — 동기 파싱(pdf-parse) |
| GET | `/materials` | – | `[{materialId,title,courseName,examDate,status,chapterCount,taughtCount,createdAt}]` |
| GET | `/materials/{id}` | – | §5-4-1 |
| DELETE | `/materials/{id}` | – | `{ok:true}` |
| GET | `/sources/{id}/content` | – | `{sourceId, fileName, text}` |
| **POST** | **`/materials/{id}/generate`** [D] | – | **SSE** (§6-1). 완료 시 Material.title/chapters 저장, status READY |

5-4-1 `GET /materials/{id}`
```json
{ "materialId":"mat_x", "title":"4장 프로세스 스케줄링", "courseName":"운영체제", "examDate":"2026-10-08", "status":"READY",
  "sources":[{"sourceId":"src_x","kind":"PDF","fileName":"os-ch4.pdf","charCount":18234}],
  "chapters":[{ "chapterId":"chp_1","order":1,"title":"프로세스와 스레드","points":["프로세스 상태 전이","PCB","컨텍스트 스위칭"],
                "sourceId":"src_x","startOffset":0,"endOffset":3120,
                "action":{"kind":"START"} ,                      // START | CONTINUE(sessionId) | RETRY(마지막 세션 완료됨)
                "taughtAt":null,"stableAt":null,"bestScore":null,"openGapCount":0 }] }
```
`action`: 진행 중 세션(COMPLETED/FAILED 아님) 있으면 `{"kind":"CONTINUE","sessionId":"sess_x","status":"EXPLAINING"}`; 완료 세션만 있으면 `{"kind":"RETRY"}`; 없으면 `START`. **잠금 규칙 없음**(원본의 순차 잠금은 컷 — 아무 목차나 바로 가르치기 가능).

### 5-5. 세션 — CRUD/전이 [C]
| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/sessions` | `{chapterId, juniorLevel?:"EASY"\|"HARD"}` | `{sessionId}` (status PREPARING) |
| GET | `/sessions` | – | `[{sessionId, chapterTitle, materialTitle, courseName, status, stageLabel, score, finalVerdict, updatedAt}]` |
| GET | `/sessions/{id}` | – | §5-5-1 세션 객체 |
| PATCH | `/sessions/{id}` | `{juniorLevel}` | 세션 객체 (EXPLAINING 중에만 허용) |
| DELETE | `/sessions/{id}` | – | `{ok:true}` |
| POST | `/sessions/{id}/finish-explanation` | – | `{status:"EXPLAINING", phase:"EXAM_READY"}` (USER 메시지 1개 이상 필요, 아니면 409 `NO_EXPLANATION`) |
| POST | `/sessions/{id}/start-exam` | – | `{status:"EXAM_IN_PROGRESS", exam:{examId, questions:[{qid,order,points,question,objectiveRef}]}}` |
| GET | `/sessions/{id}/result` | – | §5-5-2 결과 객체 (RESULT_READY 이후) |
| POST | `/sessions/{id}/gaps/{gapId}/reviewed` | – | `{gapId, status:"REVIEWED", remaining: n}` |
| POST | `/sessions/{id}/complete` | – | `{status:"COMPLETED", score, finalVerdict, openGapCount, chapter:{taughtAt, stableAt}}` |
| POST | `/sessions/{id}/messages/{mid}/exclude` (P1) | – | `{ok:true}` |

5-5-1 세션 객체
```json
{ "sessionId":"sess_x", "status":"EXPLAINING", "phase":"QUESTION", "juniorLevel":"EASY",
  "chapter":{"chapterId":"chp_1","order":1,"title":"...","points":["..."]},
  "material":{"materialId":"mat_x","title":"...","courseName":"운영체제"},
  "objectives":[{"id":"o1","text":"프로세스 상태 전이 5단계를 설명할 수 있다"}],
  "messages":[{"messageId":"msg_1","role":"JUNIOR","stage":"QUESTION","content":"선배, 프로세스가 뭔지부터 알려줄래?","createdAt":"ISO"}],
  "heardConcepts":["프로세스","PCB"],
  "exam": null | {"examId":"exam_x","status":"READY","questions":[{"qid":"q1","order":1,"points":34,"question":"...","objectiveRef":"o1"}],"answers":[{"qid":"q1","answer":"..."}]},
  "score":null, "finalVerdict":null, "gapCount":0, "createdAt":"ISO", "updatedAt":"ISO" }
```
`rubric`은 절대 내려주지 않는다.

5-5-2 결과 객체
```json
{ "sessionId":"sess_x", "status":"RESULT_READY", "totalScore":94, "questionCount":3, "correctCount":2, "partialCount":1, "wrongCount":0,
  "finalVerdict":"MOSTLY",
  "items":[{"qid":"q1","order":1,"points":34,"question":"...","answer":"...","sentences":[{"sentence":"...","ref":2,"level":"STRONG","unlearned":false}],
            "grade":{"score":28,"maxScore":34,"verdict":"PARTIAL","comment":"..."}}],
  "gaps":[{"gapId":"gap_x","qid":"q1","title":"...","diagnosis":"...","evidenceQuote":"...","concepts":["..."],"sourceExcerpt":"...","status":"FOUND",
           "tutorMessages":[{"id":"tm_x","request":"...","response":"...","createdAt":"ISO"}]}],
  "chapter":{"chapterId":"chp_1","title":"...","taughtAt":null,"stableAt":null} }
```

### 5-6. 세션 — LLM 스트리밍 [D] (모두 SSE, §6 이벤트)
| 메서드 | 경로 | 요청 | 비고 |
|---|---|---|---|
| GET | `/sessions/{id}/prepare` | – | PREPARING에서만. 학습목표·시험문항·첫 질문 생성 후 EXPLAINING으로 전이. 이미 EXPLAINING이면 즉시 `ready` 1개만 보내고 종료(새로고침 안전) |
| POST | `/sessions/{id}/explanations` | `{content:string}` (1~2000자) | USER 메시지 저장 → 자료 대조(되묻기) → 반응·다음 질문 스트림 |
| POST | `/sessions/{id}/exam/answers` | `{qid}` | 해당 문항 답안 생성 스트림. 이미 답했으면 `answer.recap`+`answer.saved{cached:true}` |
| POST | `/sessions/{id}/evaluate` | – | 3문항 모두 답한 뒤. 문항별 `grade` → `gap`들 → `done`. 완료 시 RESULT_READY |
| POST | `/sessions/{id}/tutor` | `{gapId, content?}` (content 없으면 프리셋 "이 부분을 자료 기준으로 쉽게 설명해줘") | 글자 단위 스트림 |

---

## 6. SSE 프로토콜 (FROZEN) — `src/contracts/events.ts`

와이어 포맷: `Content-Type: text/event-stream; charset=utf-8`, 첫 줄 `: connected\n\n`, 이벤트는 `event: <name>\ndata: <JSON 한 줄>\n\n`. 15초마다 `: ping\n\n`. 오류는 `event: error` + `data:{code,message}` 후 종료. 마지막은 항상 `event: done`.

```ts
// src/contracts/events.ts
export type SseEvent =
  // 6-1 목차 생성 /materials/{id}/generate
  | { event: "progress"; data: { step: "READING"|"SPLITTING"|"TITLING"; message: string; elapsedMs: number } }
  | { event: "chapters"; data: { title: string; chapters: Array<{ chapterId: string; order: number; title: string; points: string[] }> } }
  // 6-2 세션 준비 /sessions/{id}/prepare
  | { event: "progress"; data: { step: "OBJECTIVES"|"QUESTIONS"|"GREETING"; message: string; elapsedMs: number } }
  | { event: "ready"; data: { session: SessionDto } }
  // 6-3 가르치기 /sessions/{id}/explanations
  | { event: "user.saved"; data: { messageId: string } }
  | { event: "junior.concepts"; data: { heardConcepts: string[]; added: string[] } }
  | { event: "junior.doubt"; data: { messageId: string; content: string } }          // ★ 되묻기 (EASY에서 모순 감지 시). 이 턴은 여기서 종료(question 없음)
  | { event: "junior.token"; data: { token: string } }                               // 문장 단위
  | { event: "junior.message"; data: { messageId: string; stage: "REACTION"; content: string } }
  | { event: "junior.question"; data: { messageId: string; content: string; coveredObjectives: string[] } }
  // 6-4 시험 답안 /sessions/{id}/exam/answers
  | { event: "answer.sources"; data: { qid: string; sources: Array<{ ref: number; content: string }> } }   // ref = USER 메시지 순번(1-base)
  | { event: "answer.thought"; data: { qid: string; token: string; closed: boolean } }                     // 글자 단위 속마음
  | { event: "answer.token"; data: { qid: string; token: string } }                                        // 문장 단위
  | { event: "answer.recall"; data: { qid: string; ref: number | null; level: "STRONG"|"FAINT"|"NONE"; unlearned: boolean } }
  | { event: "answer.recap"; data: { qid: string; sentences: Array<{ sentence: string; ref: number|null; level: string; unlearned: boolean }> } }
  | { event: "answer.saved"; data: { qid: string; answer: string; cached: boolean } }
  | { event: "exam.completed"; data: { examId: string } }
  // 6-5 채점 /sessions/{id}/evaluate
  | { event: "grading"; data: { qid: string } }
  | { event: "grade"; data: { qid: string; score: number; maxScore: number; verdict: "CORRECT"|"PARTIAL"|"WRONG"; comment: string } }
  | { event: "gap"; data: GapDto }
  | { event: "result"; data: { totalScore: number; finalVerdict: "NEEDS_WORK"|"MOSTLY"|"STABLE"; gapCount: number } }
  // 6-6 튜터 /sessions/{id}/tutor
  | { event: "tutor.token"; data: { token: string } }
  | { event: "tutor.message"; data: { id: string; gapId: string; request: string; response: string } }
  // 공통
  | { event: "error"; data: { code: string; message: string } }
  | { event: "done"; data: Record<string, unknown> };
```

클라이언트 파서(A 소유 `lib/client/api.ts`):
```ts
export async function sse(url: string, init: RequestInit, onEvent: (name: string, data: any) => void, signal?: AbortSignal) {
  const res = await fetch(base(url), { ...init, headers: { "Content-Type": "application/json", ...(init.headers||{}) }, signal });
  if (!res.ok || !res.body) throw await toApiError(res);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  while (true) { const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n\n")) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      if (chunk.startsWith(":")) continue; let name = "message", data = "";
      for (const line of chunk.split("\n")) { if (line.startsWith("event:")) name = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); }
      onEvent(name, data ? JSON.parse(data) : {}); } }
}
export const api = { get: <T>(u: string) => json<T>(u), post: <T>(u: string, body?: unknown) => json<T>(u, { method: "POST", body: body ? JSON.stringify(body) : undefined }), patch, del, upload: (u: string, fd: FormData) => json(u, { method: "POST", body: fd }) };
```
서버 헬퍼(D 소유 `lib/server/sse.ts`): `createSse()` → `{ response: Response, send(event, data), ping(), close() }` (ReadableStream + TextEncoder, `: connected` 자동 전송, 15s ping 타이머, close 시 타이머 해제).

---

## 7. LLM 파이프라인 (D 소유)

### 7-1. 인터페이스 `lib/llm/index.ts` (시그니처 FROZEN, T+2h 커밋)
```ts
export type ChapterText = { title: string; points: string[]; text: string };     // text = source.text.slice(start,end)
export type TaughtMsg = { ref: number; content: string };                        // 사용자 USER 메시지(excluded 제외), 1-base 순번

export interface Llm {
  generateChapters(input: { sources: { sourceId: string; text: string }[] }):
    Promise<{ title: string; chapters: { title: string; points: string[]; sourceId: string; startOffset: number; endOffset: number }[] }>;
  prepareSession(input: { chapter: ChapterText; level: "EASY"|"HARD" }):
    Promise<{ objectives: { id: string; text: string }[]; questions: { qid: string; order: number; points: number; question: string; objectiveRef: string; rubric: string }[]; firstQuestion: string }>;
  juniorTurn(input: { chapter: ChapterText; level: "EASY"|"HARD"; objectives: {id:string;text:string}[]; heardConcepts: string[]; history: { role: "USER"|"JUNIOR"; stage: string; content: string }[]; explanation: string }):
    AsyncIterable<{ type: "concepts"; heardConcepts: string[]; added: string[] } | { type: "doubt"; content: string } | { type: "reaction"; content: string } | { type: "question"; content: string; coveredObjectives: string[] }>;
  writeExamAnswer(input: { question: string; taught: TaughtMsg[]; heardConcepts: string[] }):
    AsyncIterable<{ type: "sources"; sources: TaughtMsg[] } | { type: "thought"; token: string; closed: boolean } | { type: "sentence"; text: string; ref: number|null; level: "STRONG"|"FAINT"|"NONE"; unlearned: boolean } | { type: "final"; answer: string }>;
  gradeExam(input: { chapter: ChapterText; questions: { qid: string; question: string; points: number; rubric: string }[]; answers: { qid: string; answer: string }[]; taught: TaughtMsg[] }):
    AsyncIterable<{ type: "grade"; qid: string; score: number; maxScore: number; verdict: "CORRECT"|"PARTIAL"|"WRONG"; comment: string } | { type: "gap"; qid: string; title: string; diagnosis: string; evidenceQuote: string; concepts: string[]; sourceExcerpt: string }>;
  tutorExplain(input: { chapter: ChapterText; gap: { title: string; diagnosis: string; sourceExcerpt: string }; request: string }):
    AsyncIterable<{ type: "token"; token: string } | { type: "final"; response: string }>;
}
export const llm: Llm; // provider.ts에서 LLM_PROVIDER에 따라 openai | anthropic | stub 구현을 export
```
- `lib/llm/provider.ts`: `completeJSON<T>(system, user, zodSchema, {temperature})` (JSON 모드 + zod 파싱 실패 시 1회 재시도) / `streamText(system, user)` (토큰 async iterable). OpenAI는 `chat.completions` + `response_format:{type:"json_object"}`, Anthropic은 `messages.stream`. 모델 ID는 `LLM_MODEL` 환경변수.
- `lib/llm/stub.ts`: `fixtures/`의 JSON을 지연(300ms/문장) 섞어 돌려주는 가짜 구현. **데모 세이프 모드**. 모든 라우트가 provider 교체만으로 동작해야 한다.
- 모든 프롬프트는 한국어, 출력은 JSON. `lib/llm/prompts/*.ts`에 파일당 1개.

### 7-2. 프롬프트 사양

**P1 generateChapters** — 긴 자료는 문단 단위로 쪼개 `[P0]`,`[P1]`… 라벨을 붙여 넣고, LLM은 **문단 인덱스 범위**를 돌려준다(글자 오프셋을 LLM에 시키지 않는다). 서버가 인덱스→offset 변환.
- 입력: 자료 전체(최대 40,000자, 넘으면 앞부분 + "…이하 생략"), 문단 라벨
- 규칙: 챕터 4~12개, 각 300~4,000자, 제목 ≤ 20자, points 2~4개(각 ≤ 15자), 원문 순서 유지, 겹침·누락 없음, 자료 제목 ≤ 20자
- 출력 `{ "title": "...", "chapters": [ { "title": "...", "points": ["..."], "startPara": 0, "endPara": 7 } ] }`

**P2 prepareSession**
- 입력: 챕터 제목·points·본문, level
- 출력: `objectives` 3개(o1~o3, "~을 설명할 수 있다" 형태, points와 1:1), `questions` 3개(q1~q3, 배점 34/33/33, 서술형 1~2문장 질문, objectiveRef, rubric = 정답에 꼭 들어가야 할 요소 2~3개를 `;`로), `firstQuestion` (새내기 말투, points[0]부터: EASY "선배, {개념}부터 알려줄래?", HARD "{개념}부터 말해 줘. 받아쓸게.")
- 금지: 자료 밖 지식 요구, 계산 문제

**P3 juniorTurn (2단계 호출)**
- 3-A 대조(JSON): 입력 = 챕터 본문 + 사용자 설명 1개 → `{ "heardConcepts": ["..."], "contradictions": [ { "claim": "사용자가 말한 문장", "why": "자료와 어긋나는 이유(내부용)" } ], "coveredObjectives": ["o1"] }`. 모순 판정 기준: 자료가 명시한 사실과 **정반대/수치 불일치**만. 자료에 없는 보충 설명은 모순 아님.
- 3-B 생성(JSON): 입력 = level, history 요약, 설명, 3-A 결과
  - `level=EASY && contradictions.length>0` → `{ "doubt": "어? {claim 요지}라고? 나는 반대로 들은 것 같은데… 한 번만 더 설명해줄래?" }` **정답·자료 내용을 절대 말하지 않는다**. 이 턴은 doubt로 끝(질문 없음). 서버는 DOUBT 메시지 저장, heardConcepts에 **추가하지 않음**.
  - 그 외 → `{ "reactions": ["…구나.", "…는 좀 헷갈리네."], "question": "다음 질문" }` reactions 1~3문장(각 ≤ 40자, 들은 내용을 자기 말로 되뇜), question은 아직 안 다룬 objective 기반, 전부 다뤘으면 "응응, 더 말해 줘! 궁금한 거 생기면 물어볼게."
  - HARD 말투: 반말·짧게, 되묻기 없음("받아쓸게"). EASY 말투: 호기심 많은 신입생.
- 서버 저장: USER(ANSWER) → JUNIOR(REACTION)들 → JUNIOR(QUESTION) 또는 JUNIOR(DOUBT). heardConcepts는 합집합으로 Session에 저장.

**P4 writeExamAnswer** — 새내기는 **taught(사용자 USER 메시지)와 heardConcepts만** 안다. 자료 본문은 넣지 않는다.
- 출력(JSON): `{ "thought": "짧은 속마음 ≤ 30자", "sentences": [ { "text": "답안 문장", "ref": 2, "level": "STRONG" } ], "unlearned": false }`
- 규칙: 문장 1~4개, 존댓말 서술, 각 문장은 반드시 어느 ref(사용자 메시지 순번)에서 왔는지 표시. 근거 없는 문장 금지. 들은 게 없으면 `unlearned:true` + 문장 1개 "이 부분은 선배한테 못 들어서 모르겠습니다."
- level: 사용자 문장과 의미 겹침 ≥ 70% STRONG, 30~70% FAINT, 그 외 NONE(서버가 ref 없는 문장에 NONE)
- 스트리밍: 서버가 thought를 글자 단위로, 문장을 문장 단위로 쏜다(LLM 토큰 스트림 불필요 — JSON 한 번 받고 연출).

**P5 gradeExam** — 채점 기준은 **자료 본문 + rubric**. 사용자가 뭐라고 했는지가 아니라 자료가 정답.
- 문항별 출력: `{ "qid":"q1", "score": 28, "verdict": "PARTIAL", "comment": "≤ 120자, 무엇이 맞고 무엇이 빠졌는지" }` (score는 rubric 요소 충족 비율 × points, 자료에 없는 서술은 가점 없음·감점 없음, 자료와 반대면 WRONG)
- gap: verdict ≠ CORRECT인 문항마다 1개 `{ "title": "≤ 25자", "diagnosis": "3~5문장: 새내기 답안의 어떤 부분이 자료와 다르거나 빠졌는지 → 그게 사용자 설명 [ref n]에서 비롯됐는지(없으면 '설명에서 다루지 않음')", "evidenceQuote": "원인이 된 사용자 설명 원문 또는 ''", "concepts": ["..."], "sourceExcerpt": "자료에서 해당 부분 1~2문장 그대로 인용" }`
- 총점 = Σscore, finalVerdict 규칙 §4.

**P6 tutorExplain** — 입력: gap + 자료 발췌 + 요청. 출력: 4~6문장, 자료 발췌 근거로, 쉬운 비유 1개, 마지막 문장은 "이것만 기억하면 됩니다: …". 글자 단위 스트리밍(streamText 사용).

### 7-3. 품질 가드 (D)
- 모든 JSON 출력은 zod로 검증, 실패 시 "JSON만 출력" 지시 추가해 1회 재시도, 또 실패하면 `error{code:"LLM_FAILED"}` 전송 후 세션 status는 그대로 두고 클라이언트가 "다시 시도" 버튼 노출.
- 토큰 상한: 챕터 본문 8,000자 초과 시 앞뒤 유지 중간 축약. 응답 max_tokens 1,500.
- `scripts/eval-llm.ts`: fixtures의 자료 2개로 P1~P5를 돌려 (a) 챕터 수 4~12 (b) 문항 3개·배점 합 100 (c) 틀린 설명 fixture에 doubt 발생 (d) 안 가르친 문항 unlearned (e) 채점 총점 0~100 을 assert. `pnpm eval:llm`.

---

## 8. 화면 사양

### 8-1. 공통 셸 [A]
- 좌측 고정 사이드바 240px: 로고 "새내기", 메뉴 [홈 `/`] [새 자료 `/new`] [내 세션 `/sessions`] [지식 지도 `/map`(P1)] ; 하단 프로필 카드(닉네임, 완료 n회, 평균 점수, [로그아웃]). 모바일(<900px)은 상단 바 + 햄버거.
- 공통 컴포넌트(`components/shell`): `Card`(흰 배경, 1px 테두리, 반경 16, 하단 2px 진한 보더로 종이 느낌), `Button`(primary/secondary/ghost, 로딩 스피너), `Chip`, `Stepper`(단계 1~4), `EmptyState`, `Toast`, `ConfirmDialog`, `PageHeader`.
- 로그인 가드: `app/(app)` 레이아웃에서 `/api/auth/me` 401이면 `/login`으로.

### 8-2. 로그인 `/login` [A]
- 중앙 카드: "처음 뵙겠습니다, 선배" / "가르친 만큼만 아는 새내기가 선배의 설명을 기다리고 있습니다." / 데모 계정 버튼 3개(`/auth/demo-accounts`) → `demo-login` → `/`.

### 8-3. 홈 `/` [A]
- `GET /home`. 헤더 "홈" + 우측 [+ 새 자료].
- 과목 섹션: 과목명 + D-day 칩("D-7", 지났으면 "시험 끝"). 안에 자료 카드: 제목, "목차 6개 중 2개 가르침" 진행바, 이어하기 버튼(resume 있으면 `/session/{id}/{status별 경로}`, 없으면 `/materials/{id}`).
- 하단 2열: "최근 세션"(5개, 판정 칩+점수, 클릭 → `/session/{id}/complete` 또는 진행 중 경로) / "통계"(완료 횟수, 평균 점수, 연속 학습일).
- status→경로: PREPARING→`/prepare`, EXPLAINING→`/teach`, EXAM_IN_PROGRESS→`/exam`, EVALUATING·RESULT_READY→`/result`, REVIEWING→`/review`, COMPLETED→`/complete`. (이 매핑 함수 `routeForSession(session)`은 `lib/client/api.ts`에 두고 B도 import)

### 8-4. 새 자료 `/new` [A]
- 폼: 과목명(필수, 예 "운영체제"), 시험일(선택, date), 파일 드롭존(md/txt/pdf, 다중, 각 10MB) + 파일 리스트(이름·크기·삭제). 샘플 버튼 2개("운영체제 샘플", "경제학 샘플" → `fixtures/`의 md를 fetch해 File로 만들어 업로드).
- [목차 뽑기] → `POST /materials`(multipart) → `/materials/{id}`로 이동하면서 즉시 `POST /materials/{id}/generate` SSE 시작(§8-5).

### 8-5. 자료 상세 `/materials/[id]` [A]
- status PENDING이면 생성 패널: 마스코트 + "새내기가 자료를 읽는 중" + progress.message + 경과초. `chapters` 이벤트 수신 시 리스트로 전환. 오류면 [다시 시도].
- READY: 헤더(제목, 과목·D-day, 소스 칩), 안내 "한 번에 목차 하나를 가르칩니다. 순서는 자유입니다."
- 목차 행: 번호, 제목, points 칩, 상태 아이콘(미가르침 ○ / 가르침 ● / 안정 ★), bestScore·놓친 곳 n, 우측 버튼: action.kind START→[가르치기], CONTINUE→[이어하기], RETRY→[다시 가르치기]. 클릭 → `POST /sessions {chapterId}` → `/session/{id}/prepare`.
- 하단 [자료 삭제](ConfirmDialog).

### 8-6. 세션 준비 `/session/[id]/prepare` [B]
- 진입 즉시 `GET /sessions/{id}/prepare` SSE. 화면: 마스코트(생각 중) + "새내기가 자료를 읽고 시험 문제를 만드는 중" + progress + 경과초. 그동안 난이도 카드 2개(라디오): **쉽게** "선배, 나 궁금한 거 많아. 이상하면 바로 되물을게." / **어렵게** "말하는 대로 받아쓸게. 틀려도 안 물어. 시험에서 봐." (선택 시 `PATCH {juniorLevel}`; ready 전이면 로컬에 들고 있다가 ready 후 PATCH).
- `ready` 수신 → 버튼 [이 새내기로 시작 →] → `/teach`.

### 8-7. 가르치기 `/session/[id]/teach` [B] — 핵심 화면
- 헤더: ← 자료명, 칩 "가르치기", 챕터 제목, 부제 "새내기는 가르친 내용만 기억합니다", Stepper(1 가르치기 · 2 시험 · 3 결과 · 4 되짚기).
- 우측 보조 패널(토글): "학습 목표 3개"(coveredObjectives로 체크 표시) + "새내기가 들은 개념" 칩(heardConcepts). → 사용자가 뭘 더 가르쳐야 하는지 즉시 보임(원본엔 없는 UX).
- 대화 영역: 과거 턴은 "새내기의 질문 / 내 설명" 묶음 카드. 최신 JUNIOR 질문은 마스코트 옆 큰 말풍선 "새내기 · 질문". **DOUBT는 노란 말풍선 "새내기 · 되물음"** + 마스코트 갸웃 상태.
- 입력: textarea(placeholder "새내기의 질문에 선배의 말로 답해주세요.", Enter=줄바꿈, Ctrl+Enter=전송) + [보내기]. 전송 중 비활성, 마스코트 "…" 타이핑 인디케이터.
- 전송 흐름: `POST /explanations` SSE → `user.saved`(내 카드 확정) → `junior.concepts`(칩 갱신) → `junior.doubt`(되물음 말풍선, 턴 종료) 또는 `junior.token/message`(문장 단위로 반응 말풍선에 쌓임, 글자 타이핑 연출 20ms/자) → `junior.question`(큰 말풍선 교체) → `done`.
- 자료 보기 버튼: 모달 "자료를 보면서 설명하면 아는 것 같은 착각이 들기 쉽습니다. 막힐 때만 잠깐 보세요." [자료 보기][계속 설명] → 우측 드로어에 `GET /sources/{id}/content`의 챕터 범위만 표시.
- 하단 [그만 가르치고 시험 보기 →] (USER 메시지 0개면 비활성, 스트림 중 비활성) → `POST /finish-explanation` → `/exam`.
- 오류: `error` 이벤트 시 토스트 + 마지막 내 설명 카드에 [다시 보내기].

### 8-8. 시험 `/session/[id]/exam` [B]
- 첫 진입(phase EXAM_READY, exam 없음): 인트로 — 마스코트(연필 든 상태) "나 이제 시험 볼게! 배운 만큼만 답할게. 끝날 때까지 조용히 지켜봐 줘." [시험 시작] → `POST /start-exam`.
- 시험 중: 상단 "답안 작성 중 1 / 3" + 진행바 + [보기 설정 ▾](속마음 보기 / 한 번에 보기 / 자동 진행 — localStorage).
  - 답안지 카드(종이 질감, `--paper`): 머리 "2026학년도 새내기 학력평가 답안지", [성명 | 새내기] [과목 | 과목명] [배점 | 100]; "1. [34점] 문항"; 답란 줄노트 위에 손글씨 폰트로 타이핑.
  - 문항마다 `POST /exam/answers {qid}` SSE: `answer.sources`로 우측 패널 "새내기가 떠올리는 내 설명"(ref별 카드) 표시 → `answer.thought` 마스코트 머리 위 말풍선(글자 단위, closed면 2초 후 사라짐) → `answer.token` 문장 타이핑(30ms/자, "한 번에 보기"면 즉시) + `answer.recall`로 해당 ref 카드 노란 하이라이트(level FAINT는 연한 색, unlearned면 답란에 빨간 밑줄 + "못 들은 부분" 칩) → `answer.saved` → [다음 문항 풀기 (2 / 3) →]. "자동 진행"이면 1초 후 자동 호출.
  - 페이지네이션 ◁ 1 2 3 ▷ (답한 문항 다시 보기 → recap 수신 시 즉시 렌더).
- `exam.completed` 수신 후 버튼 [답안 제출하고 채점 받기 →] → `/result` (result 페이지가 evaluate 시작).

### 8-9. 채점·성적 `/session/[id]/result` [B]
- 진입 시 status가 EXAM_IN_PROGRESS면 `POST /evaluate` SSE 시작; EVALUATING/RESULT_READY면 `GET /result`만.
- 채점 중: 상단 "채점 진행 중 0 / 3" + 좌측 채점 순서(문제 1~3: 대기/채점 중/점수) + 우측 답안지에 문항별 "채점 전" 칩. `grading`→스피너, `grade`→"28 / 34" + 채점 소견 박스(verdict 색: CORRECT 초록, PARTIAL 주황, WRONG 빨강), `gap`→하단 "놓친 곳" 리스트에 추가, `result`→성적표로 전환.
- 성적표: 마스코트 말풍선 "배운 건 다 썼어. 못 쓴 데는 아직 못 들은 부분이야." / 종이 카드 "성적통지표": [성명 새내기][과목][총점 94/100][문항 3][정답 2][부분 1][오답 0] / "놓친 곳 N군데".
- 버튼: [왜 틀렸는지 보기 →](`/review`, gap 0이면 숨김) / [놓친 곳 남기고 끝내기](`POST /complete` → `/complete`) / [문항별 채점 다시 보기](위로 스크롤).

### 8-10. 되짚기 `/session/[id]/review` [B]
- `GET /result`. 좌측 메인: "놓친 곳 되짚기 · N곳". gap 카드(번호, 제목): 섹션 "자료에서는"(sourceExcerpt 인용 박스 + [자료에서 보기] → 드로어에 챕터 본문, excerpt 하이라이트), "진단"(diagnosis), "원인이 된 내 설명"(evidenceQuote, 없으면 "이 부분은 설명하지 않았습니다").
  - 카드 하단 [이해했어요 ✓] → `POST /gaps/{gapId}/reviewed` → 카드 접힘 + 체크. 전부 REVIEWED면 상단 CTA [되짚기 마치기 →] 활성 → `POST /complete` → `/complete`.
- 우측 "AI 튜터" 패널: 현재 gap 제목, [이 부분 쉽게 설명 받기](프리셋) / textarea "더 궁금한 점" + [질문]. `POST /tutor` SSE → 글자 단위 스트리밍 말풍선. 과거 tutorMessages는 result에서 불러와 표시.

### 8-11. 완료 `/session/[id]/complete` [B]
- `GET /sessions/{id}` + `GET /result`. 마스코트 상태: STABLE→기쁨(점프), MOSTLY→칭찬, NEEDS_WORK→격려.
- "학습 완료" / 판정 칩(STABLE "안정" 초록 · MOSTLY "대부분 이해" 주황 · NEEDS_WORK "보완 필요" 회색) / 챕터 제목 / 점수 큰 숫자 / 놓친 곳 n개.
- 면책 문구: "이 판정은 이번에 선배가 가르친 내용으로 새내기가 받은 결과입니다. 선배의 이해도 자체를 뜻하지 않습니다."
- 챕터 상태 카드: "가르침 ●" 획득 애니메이션(taughtAt이 이번 세션에 생겼으면 "처음으로 가르쳤습니다!"), stableAt이면 "★ 안정".
- 버튼: [같은 목차 다시 가르치기](`POST /sessions`) / [자료로 돌아가기] / [홈].

### 8-12. 내 세션 `/sessions` [A]
- `GET /sessions`. "진행 중 n" / "완료 n" 두 섹션. 행: 챕터 제목, 과목 · 자료, 상대 시간, 칩(stageLabel 또는 "판정 · 점수"), [이어하기/보기], 🗑(`DELETE`).

### 8-13. 지식 지도 `/map` (P1) [A]
- `GET /materials` + 각 `GET /materials/{id}`: 과목별 아코디언 → 목차 행에 ○/●/★ + bestScore + 놓친 곳. 클릭 → `/materials/{id}`.

### 8-14. 마스코트 [B] `components/mascot/Mascot.tsx`
- props: `state: "idle"|"thinking"|"doubt"|"writing"|"praise"|"cheer"|"encourage"`, `size`, `bubble?: ReactNode`.
- 인라인 SVG 캐릭터(학사모 쓴 둥근 캐릭터, 눈·입 파츠만 상태별 교체). 애니메이션은 CSS keyframes(idle 숨쉬기, thinking 눈 좌우, writing 손 흔들림, cheer 점프). `prefers-reduced-motion` 존중. **원본의 병아리/달걀 모티프는 쓰지 않는다.**

### 8-15. 디자인 토큰 [A] `app/globals.css` (원본과 다른 자체 팔레트)
```css
:root{
  --bg:#F6F5F0; --surface:#FFFFFF; --ink:#1E2330; --muted:#6B7280; --line:#E3DFD5;
  --primary:#1F6F5B; --primary-ink:#FFFFFF; --primary-soft:#E3F1EC;
  --accent:#F4B942; --accent-soft:#FFF4D6; --danger:#C0392B; --danger-soft:#FBE9E7; --warn:#D97706; --ok:#2E7D32;
  --paper:#FBF7EA; --paper-rule:#D9D0B8; --paper-ink:#2B2A26;
  --radius:16px; --radius-sm:10px; --shadow:0 1px 0 var(--line), 0 6px 20px rgba(30,35,48,.06);
  --font-sans:"Pretendard Variable",Pretendard,-apple-system,"Segoe UI",sans-serif;
  --font-hand:"Nanum Pen Script",cursive;   /* 답안지 손글씨 */
}
```
Pretendard는 `public/fonts`에 woff2(또는 jsdelivr CDN), Nanum Pen Script는 Google Fonts. 다크모드는 컷.

---

## 9. 캠퍼스 변주 요소 체크리스트
- [ ] 과목명·시험일 입력, 홈 과목 섹션 + D-day 칩 (A, C)
- [ ] 데모 자료 = 실제 전공 강의노트 형식(운영체제, 경제학원론) (D fixtures)
- [ ] 되묻기(doubt) — 발표 때 틀린 설명을 일부러 넣어 시연 (D, B)
- [ ] 학습 목표 체크 패널 — 뭘 더 가르쳐야 하는지 가시화 (B)
- [ ] 발표 멘트: "시험기간, 친구에게 설명해 보면 아는지 모르는지 바로 드러난다. 그 친구를 AI로 만들었다. 단, 이 친구는 내가 가르친 것만 안다."

---

## 10. 데모 시나리오 (2분, 리허설용)
1. 로그인(체험 1) → 홈: 운영체제 D-7, 경제학원론 D-12 카드. (10초)
2. 경제학원론 자료 → 목차 "수요의 이해" [가르치기] → 준비 화면에서 "쉽게" 선택 → 시작. (20초, 준비는 stub면 3초)
3. 새내기 질문 "수요 법칙부터 알려줄래?" → **일부러 틀리게** "가격이 오르면 수요량도 늘어" 입력 → 새내기 되물음 "어? 가격이 오르는데 더 산다고? 한 번만 더 설명해줄래?" (차별점 강조) → 올바르게 다시 설명 → 반응 + 다음 질문 → 한 번 더 설명 → [시험 보기]. (50초)
4. 시험: 자동 진행 켜고 관전, 우측에 "내 설명" 하이라이트, 3번 문항은 안 가르쳐서 "못 들은 부분". (25초)
5. 채점 → 총점·놓친 곳 1~2개 → 되짚기에서 자료 발췌+원인 설명 → 튜터 한 줄 → 완료 "대부분 이해". (15초)
- 네트워크·LLM 장애 대비: `.env`에서 `LLM_PROVIDER=stub`으로 바꾸면 같은 시나리오가 fixture로 그대로 재생된다. 리허설 때 양쪽 모두 확인.

---

## 11. 완료 기준 (Definition of Done)
- `pnpm db:reset && pnpm dev` 후 §10 시나리오가 실제 LLM과 stub 양쪽에서 끝까지 동작
- 모든 API가 §5 계약과 필드명까지 일치(B의 mock과 C/D의 실제 응답이 동일 TS 타입을 통과)
- 상태 전이 오류 시 409 + 화면 토스트, LLM 실패 시 "다시 시도" 버튼
- 1280×800, 390×844에서 가로 스크롤 없음
- `pnpm build` 경고 0, `pnpm eval:llm` 통과
- README: 설치·env·실행·데모 순서

---

## 12. 팀원별 AI 작업 지시서 (각자 자기 AI에 붙여 넣기)

> 공통 머리말(4명 모두 자기 지시서 맨 앞에 붙임):
> "다음은 해커톤 프로젝트 `teachback-campus`의 설계서다. 너는 이 중 **[내 역할]** 영역만 구현한다. 설계서의 §3 DB 스키마, §5 API 계약, §6 SSE 이벤트, §7-1 LLM 인터페이스는 FROZEN이며 절대 바꾸지 않는다. **내 소유 디렉터리 밖의 파일은 생성·수정하지 않는다** (필요하면 TODO 주석과 함께 내 영역에 임시 stub를 만든다). 작업 순서대로 진행하며 각 단계 끝에 `pnpm build`가 통과해야 한다. 커밋 메시지 접두사는 `feat(x):`다." + 이 문서 전체 첨부.

### 12-A. A — 앱 셸 · 자료 화면 (FE)
소유: `src/app/{layout.tsx,globals.css,page.tsx,login,new,materials,sessions,map}`, `src/components/{shell,material}`, `src/lib/client/api.ts`, `src/contracts/**`(최초 생성), `public/**`, 루트 설정 파일.
순서:
1. §2-2 스켈레톤 생성, deps 설치, `.env.example`, `src/contracts/{types.ts,events.ts,api.md}`를 §3·§5·§6에서 그대로 옮겨 작성(zod 스키마 포함), §8-15 토큰을 `globals.css`에. **main에 직접 커밋·푸시 (T+0.5h)**.
2. `lib/client/api.ts`: `api.get/post/patch/del/upload`, `sse()`(§6 코드), `routeForSession()`, `NEXT_PUBLIC_API_BASE` 지원. **T+2h까지 main 머지 후 FROZEN**.
3. `components/shell`: Sidebar, PageHeader, Card, Button, Chip, Stepper, EmptyState, Toast, ConfirmDialog, 로그인 가드 레이아웃.
4. `/login`, `/`(홈), `/new`(업로드+샘플), `/materials/[id]`(생성 SSE 패널 + 목차 리스트 + 세션 생성), `/sessions`.
5. (P1) `/map`.
완료 기준: C/D 라우트가 없어도 B의 `/api/mock`(또는 자체 임시 mock)으로 화면이 다 보이고, 실제 API 붙이면 시나리오 1·2단계가 동작.

### 12-B. B — 세션 화면 전부 (FE)
소유: `src/app/session/**`, `src/app/api/mock/**`, `src/components/{session,exam,mascot}`, `src/mocks/**`.
순서:
1. `src/mocks/`에 §5-5-1 세션 객체·§5-5-2 결과 객체·SSE 이벤트 시퀀스 fixture(JSON) 작성. `app/api/mock/**`에 §5 경로를 그대로 복제한 가짜 라우트(SSE는 300ms 간격으로 fixture 이벤트 재생). 로컬 `.env`에 `NEXT_PUBLIC_API_BASE=/api/mock`.
2. `Mascot`(§8-14), `SpeechBubble`, `TypingText`(글자/문장 타이핑), `AnswerSheet`(종이 답안지), `StepperHeader`.
3. `/prepare` → `/teach`(§8-7, doubt 말풍선·학습목표 패널 포함) → `/exam`(§8-8) → `/result`(§8-9) → `/review`(§8-10) → `/complete`(§8-11). 모두 A의 `sse()`/`api` 사용(머지 전엔 동일 시그니처로 로컬 복사본을 `components/session/_api.ts`에 두고 머지 후 교체).
4. 새로고침 복원: 각 페이지는 진입 시 `GET /sessions/{id}`로 상태를 읽어 `routeForSession`과 다르면 리다이렉트.
완료 기준: mock으로 §10 시나리오 3~5단계가 끝까지 재생되고, `NEXT_PUBLIC_API_BASE=/api`로 바꿔도 코드 수정 없이 동작.

### 12-C. C — DB · CRUD API · 인증 · 인제스트 (BE)
소유: `prisma/**`, `src/lib/server/{db.ts,auth.ts,ingest.ts}`, `src/app/api/{auth,home,materials/route.ts,materials/[id]/route.ts,sources,sessions/route.ts,sessions/[id]/route.ts,sessions/[id]/(finish-explanation|start-exam|result|complete|gaps|messages)}`.
순서:
1. §3 스키마 그대로 `schema.prisma`, `db.ts`(싱글턴), `auth.ts`(`requireUser`, 쿠키 `tb_uid` httpOnly), `seed.ts`(§3-1; D의 fixture 파일이 아직 없으면 짧은 더미 텍스트로). `pnpm db:reset` 동작. **T+2h main 머지**.
2. `/auth/*`, `/home`, `/materials`(multipart 파싱 → `ingest.ts`: pdf-parse/텍스트, 10MB·5개 제한, 빈 텍스트면 400), `/materials/[id]`(GET/DELETE, `action` 계산), `/sources/[id]/content`.
3. `/sessions`(POST: 챕터 존재·소유 확인 후 PREPARING 생성 / GET 목록), `/sessions/[id]`(GET 세션 객체 §5-5-1 — rubric 제외 / PATCH / DELETE), `/finish-explanation`, `/start-exam`(Exam READY→IN_PROGRESS), `/result`(§5-5-2), `/gaps/[gapId]/reviewed`, `/complete`(taughtAt/stableAt 갱신, finalVerdict는 세션에 저장된 값 사용), `/messages/[mid]/exclude`(P1).
4. 모든 전이에 §4 상태 검증(409), 소유자 검증(404). `lib/server/session-dto.ts`에 `toSessionDto()`/`toResultDto()`를 두고 D도 import하게 export.
완료 기준: curl/REST 클라이언트로 §5-2~5-5 전부 호출 가능, 시드 데이터로 홈·자료·세션 목록 응답이 §5 예시와 필드 일치.

### 12-D. D — LLM 파이프라인 · 스트리밍 라우트 (BE)
소유: `src/lib/llm/**`, `src/lib/server/sse.ts`, `src/app/api/materials/[id]/generate`, `src/app/api/sessions/[id]/{prepare,explanations,exam/answers,evaluate,tutor}`, `fixtures/**`, `scripts/eval-llm.ts`.
순서:
1. `lib/llm/index.ts` 인터페이스(§7-1) + `provider.ts`(openai/anthropic/stub 스위치, `completeJSON`/`streamText`) + `stub.ts`(fixture 재생) + `sse.ts`. `fixtures/`: 자료 md 2개(운영체제 스케줄링, 경제학 수요·공급 — 각 6~10k자 직접 작성), 각 자료의 `chapters.json`, 샘플 세션의 prepare/turn/answers/grades fixture. **T+2h main 머지**.
2. `prompts/`: P1~P6 (§7-2) + zod 스키마. `scripts/eval-llm.ts`(§7-3).
3. 라우트: `generate`(문단 분할→P1→offset 변환→Chapter 저장→`chapters` 이벤트), `prepare`(P2→objectives/Exam(READY)/첫 JUNIOR QUESTION 저장→EXPLAINING→`ready`), `explanations`(USER 저장→P3-A→P3-B→DOUBT 또는 REACTION+QUESTION 저장→이벤트), `exam/answers`(taught 수집→P4→thought 글자/문장 단위 연출→ExamAnswer 저장→3개 다 되면 `exam.completed`), `evaluate`(EVALUATING→P5 문항별→Grade/Gap 저장→총점·판정→RESULT_READY→`result`), `tutor`(P6 streamText→TutorMessage 저장).
4. 모든 라우트: `requireUser`(C) + 상태 검증(409) + try/catch로 `error` 이벤트 + 재진입 안전(prepare는 이미 EXPLAINING이면 ready만, answers는 캐시 recap).
완료 기준: `pnpm eval:llm` 통과, 실제 LLM과 stub 양쪽에서 §10 시나리오의 백엔드 구간이 curl로 재현됨, 되묻기 fixture에서 `junior.doubt` 발생.

---

## 13. 리스크 & 대응
| 리스크 | 대응 |
|---|---|
| LLM 지연/장애로 데모 중단 | `LLM_PROVIDER=stub` 세이프 모드, 리허설 때 전환 테스트 |
| JSON 파싱 실패 | zod 검증 + 1회 재시도 + `error` 이벤트 + 화면 재시도 버튼 |
| PDF 텍스트 추출 품질(이미지 PDF) | 데모는 md 샘플 사용, PDF는 보조. 빈 텍스트면 400 "텍스트를 읽을 수 없는 파일" |
| 되묻기 오탐(맞는 설명을 되묻음) | P3-A 기준을 "정반대/수치 불일치"로 좁힘, HARD에선 비활성. 발표 시나리오는 명백한 오류 사용 |
| 머지 충돌 | 디렉터리 소유권 + FROZEN 파일 + deps 단독 커밋 + 2~3시간마다 rebase |
| 원본 카피 지적 | 이름·마스코트·팔레트·문구 전부 자체 제작, 되묻기·학습목표 패널·과목/D-day는 원본에 없음을 발표에서 명시 |
