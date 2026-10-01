# KUREND · 새내기

강의 자료를 목차로 나누고, 사용자가 AI 새내기에게 직접 설명한 내용으로 시험과 되짚기를 진행하는 학습 앱입니다.

## 실행

Node.js와 pnpm이 필요합니다.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Windows에서는 `cp` 대신 `Copy-Item .env.example .env.local`을 사용할 수 있습니다. 기본 API 경로는 `/api`입니다. B의 모의 API가 준비되면 로컬 환경 변수 `NEXT_PUBLIC_API_BASE=/api/mock`으로 화면 흐름을 확인할 수 있습니다.

## 화면

- `/login`: 데모 계정 선택
- `/`: 과목별 자료, 최근 세션, 학습 기록
- `/new`: md/txt/pdf 자료 업로드 또는 샘플 선택
- `/materials/[id]`: 목차 생성, 목차별 세션 시작, 자료 삭제
- `/sessions`: 진행 중인 세션과 완료된 세션
- `/map`: 과목별 목차 학습 상태
- `/session/[id]/*`: 세션 학습 화면(B 담당)

프론트엔드의 요청·응답 구조는 [`src/contracts/api.md`](src/contracts/api.md)를 따릅니다. 홈·자료·인증·세션 API와 목차 생성 SSE는 각각 C·D 담당 구현이 연결되면 작동합니다.
