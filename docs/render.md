# Render 무료 시연 배포

기본 구성은 Google 로그인과 실제 AI(`LLM_PROVIDER=openai`)를 사용합니다.
무료 인스턴스의 SQLite 데이터는 재배포·인스턴스 재시작 시 사라질 수 있으며,
DB가 없으면 초기 시드 계정 3개와 샘플 자료를 생성하지만 운영 환경의 체험 로그인 API는 열리지 않습니다.
같은 DB 파일이 남아 있는 동안에는 재시작해도 기존 데이터를 덮어쓰지 않습니다.

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
