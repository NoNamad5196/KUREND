# KUREND · 새내기

강의 자료를 목차로 나누고, 사용자가 AI 새내기에게 직접 설명한 내용으로 시험과 되짚기를 진행하는 학습 앱입니다.

## 실행

Node.js와 pnpm이 필요합니다.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Windows에서는 `cp` 대신 `Copy-Item .env.example .env.local`을 사용할 수 있습니다. 기본 API 경로는 `/api`입니다.

C/D API가 합쳐지기 전 A 화면을 확인하려면 `.env.local`의 `NEXT_PUBLIC_API_BASE`를 `/api/a-preview`로 바꾸고 개발 서버를 실행하세요. 체험 계정으로 로그인한 뒤 샘플 자료 업로드, 목차 생성, 세션 목록, 지식 지도를 확인할 수 있습니다. 이 미리보기 API는 개발 모드에서만 동작하며 서버 재시작 시 데이터가 초기화됩니다. B의 모의 API를 사용할 때는 `/api/mock`으로 설정합니다.

## 화면

- `/login`: 데모 계정 선택
- `/`: 과목별 자료, 최근 세션, 학습 기록
- `/new`: md/txt/pdf 자료 업로드 또는 샘플 선택
- `/materials/[id]`: 목차 생성, 목차별 세션 시작, 자료 삭제
- `/sessions`: 진행 중인 세션과 완료된 세션
- `/map`: 과목별 목차 학습 상태
- `/session/[id]/*`: 세션 학습 화면(B 담당)

프론트엔드의 요청·응답 구조는 [`src/contracts/api.md`](src/contracts/api.md)를 따릅니다. 홈·자료·인증·세션 API와 목차 생성 SSE는 각각 C·D 담당 구현이 연결되면 작동합니다.

## 백엔드(C) — DB · CRUD API · 인증 · 인제스트

```bash
pnpm install            # postinstall 에서 prisma generate (→ src/generated/prisma, git 제외)
cp .env.example .env    # DATABASE_URL="file:./prisma/dev.db" (프로젝트 루트 기준)
pnpm db:reset           # prisma/dev.db 삭제 → db push → 시드
pnpm dev
```

- **Prisma 7**: datasource url 은 `prisma.config.ts` 에서 읽고(`.env` 를 직접 로드), SQLite 는 driver adapter(`@prisma/adapter-libsql`)로 연결한다. 스키마는 설계서 §3 그대로(`prisma/schema.prisma`, FROZEN).
- **시드**(`prisma/seed.ts`, 멱등): 데모 계정 `usr_demo1`(체험 1) / `usr_demo2` / `usr_demo3`. 체험 1 에 READY 자료 2개(운영체제 D-7, 경제학원론 D-12) + 완료 세션 1개(94점·놓친 곳 1) + 진행 중 세션 1개. 원본은 `prisma/seed-data/`. D 가 `fixtures/seed-data/` 에 같은 형식을 두면 그쪽을 우선한다.
- **서버 공용 모듈**(`src/lib/server/`): `db.ts`(Prisma 싱글턴) · `auth.ts`(`requireUser(req)`, 쿠키 `tb_uid`) · `http.ts`(`withApi`, `ApiError`, `json`, `parseJson`) · `ingest.ts`(md/txt/pdf → 텍스트) · `session-dto.ts`(`toSessionDto`/`toResultDto`, `sessionInclude`) · `session-access.ts`(`loadOwnedSession`, `assertStatus`) · `material-dto.ts` · `ids.ts`(`newId("sess")`).
- **API**(§5-2~5-5, base `/api`): `auth/{demo-accounts,demo-login,me,logout}` · `home` · `materials`(POST multipart `files[]`+`courseName`+`examDate?`, GET) · `materials/{id}`(GET/DELETE) · `sources/{id}/content` · `sessions`(POST/GET) · `sessions/{id}`(GET/PATCH/DELETE) · `sessions/{id}/{finish-explanation,start-exam,result,complete}` · `sessions/{id}/gaps/{gapId}/reviewed` · `sessions/{id}/messages/{mid}/exclude`. 상태 전이 위반 `409 INVALID_STATE`, 남의 자원 `404 NOT_FOUND`, 미로그인 `401 UNAUTHORIZED`, 입력 오류 `400 VALIDATION`.
- **스모크 테스트**: `pnpm dev` 를 띄운 뒤 `pnpm tsx scripts/smoke-api.ts` — 모든 응답을 `src/contracts/types.ts` 의 zod 스키마로 검증한다.
