# Render 무료 시연 배포

기본 구성은 Google 로그인과 실제 AI(`LLM_PROVIDER=openai`)를 사용합니다.
`OPENAI_API_KEY`는 Render의 비밀 환경 변수로 설정합니다. OpenAI API 사용료는 Render 플랜과 별개입니다.
무료 인스턴스의 SQLite 데이터는 재배포·인스턴스 재시작 시 사라질 수 있으며,
DB가 없으면 초기 시드 계정 3개와 샘플 자료를 생성하지만 운영 환경의 체험 로그인 API는 열리지 않습니다.
같은 DB 파일이 남아 있는 동안에는 재시작해도 기존 데이터를 덮어쓰지 않습니다.
시작 스크립트는 기존 DB에 스키마 변경만 적용하며, 데이터 손실을 강제하거나 다시 시드하지 않습니다.

## 배포

1. `render.yaml`과 `scripts/render-*` 파일을 GitHub 배포 브랜치에 올립니다.
2. Render에서 **New → Blueprint**를 선택합니다.
3. `NoNamad5196/kku_hackerton` 저장소와 해당 브랜치를 연결합니다.
4. 서비스 이름과 **Free** 플랜을 확인한 뒤 배포합니다.
5. Render의 환경 변수에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`(공개 서비스 주소)을 설정하고, Google Cloud Console의 승인된 리디렉션 URI에 `${APP_URL}/api/auth/google/callback`을 등록합니다. 별도 콜백 주소가 필요하면 `GOOGLE_REDIRECT_URI`를 설정합니다.
6. `OPENAI_API_KEY`를 비밀 환경 변수로 입력합니다. AI 키 없이 화면을 확인하려면 `LLM_PROVIDER=stub`으로 설정합니다.
7. 배포 완료 후 Render가 제공하는 주소의 `/login`에서 Google 계정으로 로그인합니다.

Render 계정에서 저장소 접근을 허용해야 합니다. 비밀값을 저장소에 기록하지 마세요.
무료 서비스가 유휴 상태에서 깨어날 때 첫 응답은 느릴 수 있습니다.

Blueprint 대신 **Web Service**로 직접 만드는 경우:

| 항목 | 값 |
| --- | --- |
| Runtime | Node |
| Plan | Free |
| Build Command | `bash scripts/render-build.sh` |
| Start Command | `bash scripts/render-start.sh` |
| Health Check Path | `/api/health` |

환경 변수는 `render.yaml`의 `envVars` 값을 그대로 사용합니다.
`PORT`는 Render가 제공하므로 직접 고정하지 않습니다.
배포 중 `db:reset`이나 매번 실행하는 `db:seed` 명령을 추가하지 마세요.
상태 점검 API는 DB 연결이 정상이면 `200 {"ok":true}`, 연결에 실패하면 `503 {"ok":false}`를 반환하며 사용자 목록을 공개하지 않습니다.
운영 환경의 `/api/auth/demo-accounts`, `/api/auth/demo-login`과 대응하는 `/api/mock/auth/*` 체험 경로는 모두 `404`를 반환합니다.

## 로컬 확인

```bash
bash scripts/render-build.sh
DATABASE_URL=file:/tmp/kurend-render-demo.db PORT=10000 LLM_PROVIDER=stub bash scripts/render-start.sh
```

이 명령은 로컬 개발 DB와 다른 데모 DB를 사용합니다.
빌드할 때는 `.next`를 함께 사용하는 개발 서버를 먼저 종료합니다.

## 세션 서명 전환

운영 쿠키는 HMAC 서명과 만료를 검증하고 HTTPS 전용으로 발급합니다. 별도 `SESSION_SECRET`이 없으면 이미 설정한 Google client secret을 사용하므로 새 필수 설정은 없습니다. 기존 서명 없는 쿠키는 허용하지 않아 배포 후 Google 재로그인이 한 번 필요합니다.

서명키는 `SESSION_SECRET` → `GOOGLE_CLIENT_SECRET` → `GOOGLE_OAUTH_CLIENT_SECRET` 순서로 선택합니다. 재시작·재배포와 모든 인스턴스에서 같은 값을 유지해야 합니다. 임시값을 매번 생성하지 마세요. 선택된 키를 변경하거나 `SESSION_SECRET`을 새로 지정하면 이전 키로 발급한 쿠키는 검증되지 않으므로 기존 사용자는 다시 로그인해야 합니다. 비밀값을 로그나 저장소에 기록하지 마세요.

## 재로그인과 인증 503 진단

로그인은 브라우저의 HttpOnly 쿠키와 DB 사용자 행이 모두 있어야 유지됩니다. 쿠키는 30일 만료이며, `localStorage`나 Google access token의 자동 갱신으로 복원하는 구조가 아닙니다.

| 응답·로그 | 의미와 확인 대상 |
| --- | --- |
| 401, `EXPIRED_SESSION` | 서명은 정상이나 쿠키 내부의 실제 만료 시각을 지남. 재로그인이 필요합니다. |
| 401, `INVALID_SESSION` | 형식·서명이 맞지 않음. 이전 무서명 쿠키, 키 변경 또는 인스턴스 간 키 불일치 여부를 확인합니다. |
| 401, 쿠키 없음 | 브라우저가 해당 호스트로 쿠키를 보내는지, HTTPS·호스트·쿠키 경로와 실제 로그아웃 여부를 확인합니다. 쿠키 원문을 로그에 남기지 않습니다. |
| 503 `AUTH_UNAVAILABLE`, `SIGNING_KEY_MISSING` | 인증 확인에 필요한 서버 서명키 설정이 없음. 배포 환경 변수를 복구합니다. |
| 503 `AUTH_UNAVAILABLE`, `ACCOUNT_NOT_FOUND` | 서명·만료가 유효한 쿠키의 사용자가 DB에 없음. 잘못된 DB 경로, DB 초기화·교체·유실 여부를 먼저 확인합니다. 재로그인으로 장애를 숨기거나 사용자 행을 임의 생성하지 않습니다. |

원인 로그는 `[auth] unavailable` 또는 `[auth] rejected`와 위 reason만 남깁니다. 계정 정보가 복구되면 만료되지 않은 기존 쿠키를 그대로 사용할 수 있습니다. 일시적인 네트워크·서비스 장애에서 클라이언트는 확인된 사용자 상태를 유지하고 재시도하며, 실제 401일 때 로그인 화면으로 이동합니다. DB 연결 자체의 실패는 서버 오류로 처리되므로 401 만료와 구분해야 합니다.

## 운영 DB 영속성

현재 Blueprint 기본값은 `plan: free`, `DATABASE_URL=file:./prisma/dev.db`이고 영속 디스크를 선언하지 않습니다. 로컬 DB 파일이 재배포나 인스턴스 교체로 사라지면, 시작 시 만들어지는 시드 DB에는 기존 Google 계정과 학습 기록이 없습니다. `/api/health`가 200이어도 기존 데이터가 보존되었다는 뜻은 아닙니다.

운영에서는 서비스의 영속 저장소에 SQLite 파일을 두고 `DATABASE_URL`이 실제 보존 경로를 가리키게 하거나, 지원되는 영속 DB 구성으로 이전해야 합니다. 기존 DB 백업·복원과 인스턴스 간 저장소 공유 조건도 함께 검증해야 합니다. 이 변경에서는 유료 플랜·디스크를 만들거나 DB를 이전하지 않았습니다.

### 원격 libSQL/Turso 선택 지원

원격 `libsql://` DB와 토큰을 사용하는 지원을 유지합니다. 실제 DB 생성·이전·접속 검증은 별도 운영 작업입니다.

1. 사용할 DB의 URL과 인증 토큰을 준비합니다.
2. Render 환경 변수에 `TURSO_DATABASE_URL`과 `TURSO_AUTH_TOKEN`을 설정합니다. `render-start.sh`가 URL을 런타임 `DATABASE_URL`로 전달합니다. 직접 실행할 때는 `DATABASE_URL=libsql://...`과 `DATABASE_AUTH_TOKEN`을 사용할 수 있습니다. 토큰 선택 순서는 `DATABASE_AUTH_TOKEN` → `TURSO_AUTH_TOKEN`이므로 두 변수를 함께 설정했다면 대상 DB와 일치하는지 확인하세요.
3. `scripts/render-db.mjs`가 로컬 임시 SQLite에 기준 스키마를 만들고 원격 대상에 없는 테이블·인덱스·컬럼을 추가합니다. 기존 계정의 온보딩 이력 업그레이드를 먼저 적용하며 기존 데이터를 다시 시드하지 않습니다. 기존 객체가 전혀 없는 새 DB에만 최초 데모 시드를 넣습니다. 사용자 수가 0이라는 이유만으로 기존 DB를 비우지 않습니다.
4. 기존 로컬 DB의 자료·계정을 옮기려면 별도의 백업·복원 절차가 필요합니다. URL만 바꾸는 것은 데이터 이전이 아닙니다. 원격 DB에도 백업과 권한 관리가 필요합니다.

Prisma CLI의 `db:push`는 로컬 기준 스키마 생성용이며, 원격 libSQL 준비에는 위 시작 스크립트를 사용합니다. 자동 준비는 추가 가능한 변경만 처리하고 테이블 삭제·컬럼 타입 변경을 수행하지 않습니다. 기본값 없는 필수 컬럼 추가 등 안전하게 자동 적용할 수 없는 변경은 준비를 중단하므로 별도 데이터 마이그레이션을 먼저 준비해야 합니다. 검증용 `RENDER_DB_FORCE_REMOTE=1`은 로컬 임시 SQLite로 원격 분기를 검사하는 용도이며 운영에서 필요하지 않습니다.

장애 확인 시 Render의 재배포·인스턴스 교체 시각, `New demo database initialized.` 로그, 실제 `DATABASE_URL`의 저장 경로와 기존 사용자 데이터 보존 여부, 서명키 변경 시점을 대조하세요. 운영 로그를 확보하기 전에는 DB 유실이나 키 변경을 실제 발생 원인으로 단정하지 않습니다.
