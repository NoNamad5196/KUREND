# D 스트리밍 라우트 통합

D의 6개 SSE 라우트는 `RouteBackend`를 통해 인증과 영속화를 호출한다. C 소유 파일이나 동결된 Prisma 스키마를 복제하지 않는다. 어댑터가 연결되지 않은 일반 실행은 `502 LLM_FAILED`를 반환한다. 모델만 `stub`으로 설정해도 인증이나 DB를 우회하지 않는다.

## C의 실제 DB 연결

C의 서버 초기화 코드에서 기존 `db`와 `requireUser`를 연결한다. 아래는 통합 예제이며 D 변경에 C 파일을 생성하지 않았다.

```ts
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { installRouteBackend } from "@/lib/llm/routes/backend";
import { createPrismaBackend } from "@/lib/llm/routes/prisma-backend";

installRouteBackend(createPrismaBackend({ db, requireUser }));
```

- `requireUser(req)`는 `{id}` 또는 `{userId}`를 반환해야 한다. 인증 실패 시 `RouteError(401, "UNAUTHORIZED", ...)` 또는 HTTP 401 `Response`를 throw한다. C의 오류 형식이 다르면 연결 콜백에서 변환한다.
- C에 기존 `toSessionDto`가 있으면 선택 옵션으로 전달할 수 있다. 콜백은 chapter/source/material, messages, exam/questions/answers/grades, gaps/tutorMessages가 포함된 **원본 Prisma aggregate**를 받는다. 기본 변환기도 공개 계약에 맞으며 어느 경로든 `SessionSchema`가 원문과 rubric을 제거한다.
- 부트스트랩은 Next.js 서버 프로세스마다, 라우트를 호출하기 전에 실행해야 한다. 이 설치는 프로세스 전역이며 클라이언트 코드에서 호출하지 않는다.
- 설치된 어댑터는 데모 환경 변수보다 우선한다.

어댑터는 JSON 문자열 컬럼을 해석하고 `source.text.slice(startOffset,endOffset)`만 챕터 원문으로 제공한다. LLM 호출이 끝난 뒤 짧은 DB 트랜잭션에서 소유권과 읽었던 전체 aggregate를 비교한다. 세션 쓰기는 추가로 `updatedAt`를 CAS 조건으로 사용하고 이전 시각보다 증가시킨다. Material에는 `updatedAt` 필드가 없으므로 트랜잭션 내부 snapshot 비교를 사용한다. 스키마에 revision 필드를 추가하지 않는다.

같은 밀리초에 생성된 반응·질문이 무작위 ID 순으로 뒤집히지 않도록, 새 메시지의 `createdAt`는 저장된 마지막 메시지보다 최소 1ms 뒤로 aggregate의 추가 순서대로 부여한다. 기존 메시지의 ID와 시각은 보존하며 C 스키마는 바꾸지 않는다.

C의 상태 전이와 메시지 제외/복습 변경도 같은 DB 트랜잭션 안에서 해당 Session의 `updatedAt`를 갱신해야 한다. 관련 행만 바뀐 경우도 전체 aggregate 비교로 감지하지만, 부모 시각을 갱신하면 재시도와 상태 표시를 일관되게 유지할 수 있다. 다른 요청이 먼저 변경한 경우 `409 INVALID_STATE`로 종료하며 새 snapshot으로 다시 요청해야 한다. 자동으로 LLM 호출을 재실행하지 않는다.

D는 삭제를 통해 기존 세션/메시지/놓친 곳을 갈아치우지 않는다. 자료 재생성에서 기존 챕터 삭제가 필요하거나 세션에서 기존 history를 제거하려는 경우 거절한다. C의 삭제 API는 C가 계속 소유한다.

현재 브랜치에 C의 schema/db/auth가 없으므로 **실제 Prisma/SQLite 통합은 검증하지 못했다**. C 병합 후 스키마 생성·시드·인증 연결과 실제 DB에서 동시 요청/전체 루프를 확인해야 한다. Prisma 7의 DB URL 및 SQLite driver adapter 구성도 C가 생성한 클라이언트 설정을 따른다.

## D 단독 데모 / curl

프로젝트 루트에서 다음 두 옵션을 모두 설정한다. 별도 C 서버나 API 키 없이 D 라우트만 실행한다.

```sh
LLM_PROVIDER=stub D_STUB_BACKEND=1 pnpm dev
```

메모리 저장소는 실제 fixture 문서 2개와 생성용 PENDING 자료, 서로 독립적인 단계별 세션을 제공한다. 서버 프로세스 재시작 시 초기화되며 여러 프로세스 사이에 공유되지 않는다. 데모 전용 쿠키 `tb_uid=usr_demo1`이 아래 자료를 소유한다. `usr_demo2`, `usr_demo3`는 인증되지만 다른 계정의 자료는 404다. 그 외 쿠키는 401이다.

| ID | 초기 상태 / 용도 |
|---|---|
| `mat_d_os` | 운영체제 fixture, READY |
| `mat_d_economics` | 경제학 fixture, READY |
| `mat_d_generate` | 운영체제 문서 복사본, PENDING → 목차 생성 |
| `sess_d_prepare` | 운영체제 PREPARING → 준비·설명 |
| `sess_d_economics` | 경제학 PREPARING → 준비·설명 |
| `sess_d_exam` | EXAM_IN_PROGRESS → 답안·채점 |
| `sess_d_result` | RESULT_READY → 튜터 |
| `sess_d_completed` | COMPLETED, 점수 94, 놓친 곳 1개 |

```sh
curl -N -b tb_uid=usr_demo1 -X POST http://localhost:3000/api/materials/mat_d_generate/generate
curl -N -b tb_uid=usr_demo1 http://localhost:3000/api/sessions/sess_d_prepare/prepare
curl -N -b tb_uid=usr_demo1 -H 'Content-Type: application/json' -d '{"content":"비선점형에서는 운영체제가 실행 중인 프로세스의 CPU를 강제로 빼앗을 수 있어."}' http://localhost:3000/api/sessions/sess_d_prepare/explanations
curl -N -b tb_uid=usr_demo1 http://localhost:3000/api/sessions/sess_d_economics/prepare
curl -N -b tb_uid=usr_demo1 -H 'Content-Type: application/json' -d '{"content":"가격이 오르면 수요도 늘어나."}' http://localhost:3000/api/sessions/sess_d_economics/explanations
curl -N -b tb_uid=usr_demo1 -H 'Content-Type: application/json' -d '{"qid":"q1"}' http://localhost:3000/api/sessions/sess_d_exam/exam/answers
curl -N -b tb_uid=usr_demo1 -H 'Content-Type: application/json' -d '{"qid":"q2"}' http://localhost:3000/api/sessions/sess_d_exam/exam/answers
curl -N -b tb_uid=usr_demo1 -H 'Content-Type: application/json' -d '{"qid":"q3"}' http://localhost:3000/api/sessions/sess_d_exam/exam/answers
curl -N -b tb_uid=usr_demo1 -X POST http://localhost:3000/api/sessions/sess_d_exam/evaluate
curl -N -b tb_uid=usr_demo1 -H 'Content-Type: application/json' -d '{"gapId":"gap_d_result_q3"}' http://localhost:3000/api/sessions/sess_d_result/tutor
```

준비/설명용 세션과 답안용 세션은 독립 fixture다. C 소유 `finish-explanation`/`start-exam`이나 CRUD 라우트를 데모 이름으로 만들지 않았다. 실제 사용자 전체 루프는 C 병합 후 검증한다. `D_STUB_BACKEND`는 실제 서비스 환경에서 설정하지 않는다.

테스트는 `createStubBackend(seed?)`로 격리 저장소를 만들고 `getSession`/`commitSession`을 통해 상태를 전환할 수 있다. `createDefaultStubSeed()`, `D_STUB_IDS`, `getStubBackend()`, `resetStubBackend(seed?)`도 제공한다. 테스트 코드의 직접 생성은 환경 변수에 관계없이 가능하지만 실제 라우트 자동 선택은 두 플래그를 모두 요구한다.
