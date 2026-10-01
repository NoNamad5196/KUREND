# KUREND · 새내기

강의 자료를 목차로 나누고, 사용자가 AI 새내기에게 직접 설명한 내용으로 시험과 되짚기를 진행하는 학습 앱입니다.

온보딩·마이페이지·후배별 가르치기 변경 내용과 검증 결과는 [UX·학습 시스템 개선 보고](docs/ux-learning-update.md)를 참고하세요.

## 실행

Node.js와 pnpm이 필요합니다.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Windows에서는 `cp` 대신 `Copy-Item .env.example .env.local`을 사용할 수 있습니다. 기본 API 경로는 `/api`입니다.

로그인은 Google 계정을 사용합니다. 서버 환경 변수에 `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET`을 설정하고, Google Cloud Console에 `${APP_URL}/api/auth/google/callback`을 승인된 리디렉션 URI로 등록하세요. `APP_URL`은 서비스의 공개 주소이며, 필요한 경우 `GOOGLE_REDIRECT_URI`로 콜백 주소를 직접 지정할 수 있습니다.

화면 개발용 API는 `NEXT_PUBLIC_API_BASE=/api/a-preview` 또는 `/api/mock`으로 선택할 수 있습니다. 체험 계정 선택 UI는 제공하지 않습니다. 개발·테스트용 `auth/demo-accounts`와 `auth/demo-login` API는 시드 계정 `usr_demo1`·`usr_demo2`·`usr_demo3`만 허용하며, 운영 환경에서는 실제·모의 체험 인증 API 모두 `404`를 반환합니다. A 미리보기 API는 개발 모드에서만 동작하고 서버 재시작 시 데이터가 초기화됩니다.

## 화면

- `/login`: Google 계정으로 로그인
- `/onboarding?mode=signup`: Google 계정 최초 가입 직후 오리엔테이션
- 마이페이지의 서비스 이용 방법 다시 보기: `/onboarding?mode=replay`
- `/mypage`: 학습 기록, 기존 오답노트·선배의 학습노트 진입, 로그아웃
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
- **API**(§5-2~5-5, base `/api`): `auth/{google,me,logout}` · `home` · `materials`(POST multipart `files[]`+`courseName`+`examDate?`, GET) · `materials/{id}`(GET/DELETE) · `sources/{id}/content` · `sessions`(POST/GET) · `sessions/{id}`(GET/PATCH/DELETE) · `sessions/{id}/{finish-explanation,start-exam,result,complete}` · `sessions/{id}/gaps/{gapId}/reviewed` · `sessions/{id}/messages/{mid}/exclude`. 상태 전이 위반 `409 INVALID_STATE`, 남의 자원 `404 NOT_FOUND`, 미로그인 `401 UNAUTHORIZED`, 입력 오류 `400 VALIDATION`. `health`는 DB 연결을 확인한 뒤 개인정보 없이 `{ok:true}`를 반환하며, DB 장애 시 `503 {ok:false}`를 반환합니다.
- **스모크 테스트**: `pnpm dev` 를 띄운 뒤 `pnpm tsx scripts/smoke-api.ts` — 모든 응답을 `src/contracts/types.ts` 의 zod 스키마로 검증한다.

## 기존 DB 업그레이드와 오리엔테이션

기존 DB를 유지하려면 `pnpm db:push`를 사용합니다. 이 명령과 `pnpm dev` / `pnpm start`는
`scripts/upgrade-onboarding.mjs`를 먼저 실행해 `User.onboardingCompletedAt`과
`Message.teachingChoicesJson`을 nullable 컬럼으로 추가합니다. 기존 데이터는 삭제하지 않습니다.
Render 시작도 같은 업그레이드를 적용합니다. Prisma CLI를 직접 호출하기 전에 이 스크립트를 먼저 실행해야
기존 계정과 새 계정을 정확히 구분할 수 있습니다.

업그레이드 당시 존재하던 계정은 완료 상태로 보존되어 바로 홈으로 이동합니다.
Google 로그인 콜백에서 계정이 처음 생성될 때만 오리엔테이션으로 이동합니다. 기존 계정은 완료 여부와 관계없이
홈으로 이동하며, 중간에 나간 계정을 일반 페이지나 재로그인에서 다시 온보딩으로 보내지 않습니다.
`POST /api/auth/onboarding`은 최초 완료 시각을 계정에 저장합니다. 다시 보기는 마이페이지에서만 안내하며,
완료 기록을 바꾸지 않고 마이페이지로 돌아옵니다. 모드 없는 `/onboarding` 직접 진입은 홈으로 이동합니다.
기존 DB를 시드로 덮어쓰지 않고 확인하려면 새 Google 계정 또는 별도의 테스트 DB를 사용하세요.

```bash
node --import tsx --test src/lib/server/__tests__/onboarding.test.ts
node --import tsx --test src/lib/server/__tests__/demo-auth.test.ts
```

이 회귀 테스트는 임시 DB에서 기존 사용자 보존, 신규 사용자 기본 상태, 중복 완료 요청,
계정 격리, 로그아웃·재로그인 후 상태 유지를 확인합니다.
