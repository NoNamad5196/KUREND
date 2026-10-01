# KUREND API 계약 (FROZEN)

> 설계서 §4·§5·§6 복사본. 변경은 팀 합의 후 소유자(A)만 수정한다.

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

