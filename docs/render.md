# Render 무료 시연 배포

이 구성은 API 키 없이 동작하는 데모 모드(`LLM_PROVIDER=stub`)입니다.
무료 인스턴스의 SQLite 데이터는 재배포·인스턴스 재시작 시 사라질 수 있으며,
DB가 없으면 체험 계정 3개와 샘플 자료를 자동으로 생성합니다.
같은 DB 파일이 남아 있는 동안에는 재시작해도 기존 데이터를 덮어쓰지 않습니다.

## 배포

1. `render.yaml`과 `scripts/render-*` 파일을 GitHub 배포 브랜치에 올립니다.
2. Render에서 **New → Blueprint**를 선택합니다.
3. `NoNamad5196/kku_hackerton` 저장소와 해당 브랜치를 연결합니다.
4. 서비스 이름과 **Free** 플랜을 확인한 뒤 배포합니다.
5. 배포 완료 후 Render가 제공하는 주소의 `/login`에서 체험 계정으로 로그인합니다.

Render 계정에서 저장소 접근을 허용해야 합니다. API 키를 입력할 필요는 없습니다.
무료 서비스가 유휴 상태에서 깨어날 때 첫 응답은 느릴 수 있습니다.

Blueprint 대신 **Web Service**로 직접 만드는 경우:

| 항목 | 값 |
| --- | --- |
| Runtime | Node |
| Plan | Free |
| Build Command | `bash scripts/render-build.sh` |
| Start Command | `bash scripts/render-start.sh` |
| Health Check Path | `/api/auth/demo-accounts` |

환경 변수는 `render.yaml`의 `envVars` 값을 그대로 사용합니다.
`PORT`는 Render가 제공하므로 직접 고정하지 않습니다.
배포 중 `db:reset`이나 매번 실행하는 `db:seed` 명령을 추가하지 마세요.

## 로컬 확인

```bash
bash scripts/render-build.sh
DATABASE_URL=file:/tmp/kurend-render-demo.db PORT=10000 LLM_PROVIDER=stub bash scripts/render-start.sh
```

이 명령은 로컬 개발 DB와 다른 데모 DB를 사용합니다.
빌드할 때는 `.next`를 함께 사용하는 개발 서버를 먼저 종료합니다.
