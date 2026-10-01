# 캐릭터 변경·학습 상태·LLM 오류 수정 결과

검증일: 2026-10-01(UTC). `main`의 `e75be52`까지 통합한 배포 변경 기준. 강의노트, 캐릭터별 문항 수, 졸업시험 화면 및 체험 3의 수업 기록 시드를 함께 유지한다.

## 원인

1. **캐릭터 선택 실패를 성공으로 처리했다.** 활성 `JuniorRun`이 있는 상태에서 선택 화면은 새 Run 생성을 요청했다. 서버의 `409 RUN_ACTIVE`를 화면에서 무시하고 돌아가므로 기존 캐릭터가 유지됐다.
2. **현재 Run과 대화 선택이 일치하지 않았다.** 자료·홈의 이어하기가 현재 Run을 확인하지 않고 열린 Session을 골랐다. 세션의 캐릭터 스냅샷과 교체된 대화 복구 경로도 없었다. 게임 정보 요청 실패를 연습 모드로 취급하고, 늦은 응답이 다른 페이지 상태에 반영될 수 있었다.
3. **목차 생성 상태가 충분히 드러나지 않았다.** 별도 애니메이션과 중복 실행 방어가 부족했고 실패 후 재시도 상태도 명확하지 않았다.
4. **오류 전달·스트림 파싱이 분산되어 있었다.** 세션 화면과 나머지 화면에 API/Error 구현이 중복됐고 SSE 파서는 줄바꿈·청크 경계·불완전 종료 처리가 취약했다. 응답 문구 생성 실패는 템플릿으로 감춰졌으며 저장된 사용자 설명을 재시도할 UI가 없었다.
5. **자료 소유 구조 자체는 캐릭터에 종속되지 않았다.** 기존 Material은 사용자 소유다. 캐릭터 변경이 자료를 삭제하는 코드는 확인되지 않았다. 잘못된 이어하기/세션 참조는 수정했지만, 실제 배포에서 발생한 모든 404의 원인을 로그 없이 단정할 수는 없다. 무료 Render의 SQLite 소실은 별도의 지속성 문제다.

## 수정 파일

아래 목록은 통합한 `main` 대비 이번 수정 파일이다. 마지막에 전체 경로를 기재했다.

| 영역 | 주요 파일 |
| --- | --- |
| 자료·학습·대화 관계 | `prisma/schema.prisma`, `src/lib/server/change-character.ts`, `session-access.ts`, `material-dto.ts`, `run-dto.ts`, `run-life.ts` |
| API | `/api/runs/[id]`, `/api/runs/[id]/final`, `/api/sessions`, `/api/sessions/[id]/game`, `/api/wrong-notes/[id]/reteach` |
| 캐릭터·대화 화면 | `materials/[id]/junior/page.tsx`, `useSession.ts`, `useSessionGame.ts`, `PreparePage.tsx`, `TeachPage.tsx` |
| 업로드·목차 | `new/page.tsx`, `materials/[id]/page.tsx`, `MaterialPreparation.tsx`, `material-preparation.css` |
| 오류·LLM·SSE | `contracts/errors.ts`, `lib/client/api.ts`, `llm/provider.ts`, `llm/live.ts`, `llm/routes/*`, `request-diagnostics.ts` |
| 배포·검증 | `scripts/render-db.mjs`, `scripts/smoke-api.ts`, `docs/render.md`, 추가 회귀 테스트 |

## 수정 내용

- 활성 Run의 캐릭터를 트랜잭션으로 변경한다. Material, Source, Chapter, Run ID, 진도, 목숨, 숙련도, 오답노트는 유지한다.
- 새 캐릭터의 Session을 만들고 이전 대화에는 `replacementSessionId`를 저장한다. 과거 메시지는 삭제하지 않으며 새 대화의 history에는 섞지 않는다. 같은 캐릭터를 다시 선택하면 대화를 중복 생성하지 않는다.
- Session에 `character`를 저장해 이미지·이름·난이도·persona·프롬프트·시험 형식을 같은 값으로 결정한다. 이전 주소로 들어오면 새 세션으로 이동한다. 다른 사용자의 세션/범위는 사용할 수 없다.
- 일반 수업, 집중 복습, 졸업시험의 범위를 구분해 교체한다. 최신 기능인 남학생 객관식 3문항, 여학생 서술형 5문항, KU 서술형 7문항, 졸업시험 혼합 10문항을 유지한다. 졸업시험 준비의 출력 예산은 최대 6,000토큰으로 제한하되 기존 1,500토큰 제한에 잘리지 않게 했다.
- 실제 서버 단계에 맞춰 책장 애니메이션과 문구를 표시한다. 가짜 백분율은 없다. 업로드·생성·학습 시작의 중복 실행을 막고 성공·실패·재시도를 구분한다.
- SSE 클라이언트를 통합하고 CRLF/CR/LF, 여러 줄 JSON, UTF-8 청크 경계, 잘못된 데이터, `done` 없이 끊어진 응답을 처리한다. 실패를 정상 응답으로 바꾸지 않는다.
- 실패한 설명은 저장 상태를 다시 읽어 복구하고 같은 USER 메시지로 재시도한다. 재시도 후 사용자 설명이 중복 저장되지 않는 것을 확인했다.
- 기존 API 오류 코드와 호환되는 `reason` 상세 분류를 추가했다. 자료/세션 없음, 대화 교체, 캐릭터 설정 누락, 요청·파싱·시간 초과·연결 설정 오류를 구분한다. 로그에는 식별자, 단계, 제공자, 상태 코드, 허용된 오류 유형만 기록한다.
- 기존 DB는 재시드하지 않고 추가 스키마를 적용한다. 데이터 손실 강제 옵션은 사용하지 않는다.

## 상태 구조

```text
User
 └─ Material ─ Source(원문) / Chapter(목차)
     └─ JuniorRun = Study Session
         ├─ materialId, character, lives, progress, mastery, wrong notes
         └─ Session = Chat Session (Chapter 또는 Final 범위)
             ├─ chapterId, runId, character(대화 시작 시 스냅샷)
             ├─ messages, objectives, exam
             └─ replacementSessionId → 캐릭터 변경 후 새 대화
```

`Material 1 / Run A / 남학생 / Chat A`에서 변경하면
`Material 1 / Run A / 여학생 / Chat B`가 된다. 완료 기록과 오답노트는 유지한다.
브라우저 저장소는 학습 목표 체크 표시만 보조하며, 자료·캐릭터·세션의 기준은 DB다.

## 테스트 결과

별도 SQLite DB와 production build, Chromium/Playwright에서 아래 흐름을 직접 실행했다.
정상 응답은 **stub 모델**로 검증했다. 실제 모델에 전달하는 persona/system prompt는 주입된 provider를 사용하는 회귀 테스트로 별도 확인했다.

| 테스트 | 결과 | 확인 내용 |
| --- | --- | --- |
| Test 1 | 성공 | 파일 업로드 → 목차 생성 → 남학생 선택 → 객관식 3문항 준비 → 채팅 응답 |
| Test 2 | 성공 | 남학생 대화 → 여학생 변경 → 동일 Material/Run/Chapter, 새 Session, 빈 대화 기록, 여학생 이미지·NORMAL·persona 응답·서술형 5문항 |
| Test 3 | 성공 | 홈/자료로 이동 후 이어하기 복원. 이전 남학생 세션 주소에서도 현재 여학생 대화로 자동 복구 |
| Test 4 | 성공 | 책장 애니메이션, 업로드/삭제/시작 중복 방지, 업로드와 생성 각각 1회, 완료 후 선택 화면 이동 |
| Test 5 | 성공 | 별도 서버의 실제 OpenAI 어댑터를 키 없는 상태로 실행해 `LLM_CONFIG_INVALID` 발생. 화면 유지, 오류 표시, 저장된 설명으로 재시도 성공, 중복 USER 메시지 0개 |
| Test 6 | 성공 | 새로고침 후 동일 자료·세션·여학생·대화 기록 복구 |

추가 검증:

- 자동 회귀 테스트 **72개 통과**, 실패/건너뜀 0개.
- 별도 시드 DB에서 API 스모크 검사 **277개 통과**, 실패 0개. 인증·자료·세션·오답노트·목숨·졸업시험·졸업·게임오버를 포함한다.
- production build 및 빌드 내 타입 검사·린트 통과. 기존 전역 폰트 관련 lint 경고 1개는 남아 있다.
- 이전 스키마의 DB 복사본에서 업그레이드 실행 후 기존 18개 테이블의 모든 행이 보존됨을 비교했다.
- 캐릭터 변경 전후 원문·목차·진도·숙련도·오답노트의 동등성, 이전 요청의 늦은 저장 차단, 여러 번 변경한 이전 주소 복구, 졸업시험 범위 보존을 DB 회귀 테스트로 확인했다.
- 브라우저 JavaScript 예외 0개. 실제 모델 API 키나 사용자 자료는 테스트 로그에 사용하지 않았다.

회귀 테스트 실행:

```bash
# DATABASE_URL은 별도 테스트 DB를 가리켜야 한다.
LLM_PROVIDER=stub LLM_STUB_DELAY_MS=0 pnpm exec tsx --test \
  src/lib/llm/__tests__/*.test.ts \
  src/lib/client/__tests__/*.test.ts \
  src/lib/server/__tests__/*.test.ts
pnpm build
```

## 남은 문제

- Codex 작업 환경의 OpenAI 키는 비어 있으므로 실제 모델 권한·응답 품질은 이 환경에서 미검증이다. Render에 설정된 키의 유무는 별도로 확인하지 못했으며, 로컬 키 부재로 Render의 키 부재를 판단할 수 없다.
- GitHub Deployments에서 Render의 `main - kurend-demo` 연결과 기존 커밋 `934ba84`의 배포 성공을 확인했다. 서비스는 `https://kurend-demo.onrender.com`이다. 수정 브랜치만 푸시하면 이 서비스에는 반영되지 않으므로, 통합 변경은 `main`에 반영하고 해당 커밋의 배포 상태를 별도로 확인한다.
- 무료 Render의 임시 파일 시스템이 초기화되면 SQLite 업로드 자료도 소실된다. 이번 캐릭터/세션 수정으로 그 플랫폼 특성이 바뀌지는 않는다.

## 전체 변경 경로
- `docs/render.md`
- `docs/study-state-fixes.md`
- `prisma/schema.prisma`
- `scripts/render-db.mjs`
- `scripts/smoke-api.ts`
- `src/app/api/materials/[id]/route.ts`
- `src/app/api/runs/[id]/final/route.ts`
- `src/app/api/runs/[id]/route.ts`
- `src/app/api/sessions/[id]/game/route.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/wrong-notes/[id]/reteach/route.ts`
- `src/app/login/page.tsx`
- `src/app/materials/[id]/junior/page.tsx`
- `src/app/materials/[id]/page.tsx`
- `src/app/new/page.tsx`
- `src/components/game/JuniorSelect.tsx`
- `src/components/game/useSessionGame.ts`
- `src/components/material/MaterialPreparation.tsx`
- `src/components/material/material-preparation.css`
- `src/components/session/_api.ts`
- `src/components/session/prepare/PreparePage.tsx`
- `src/components/session/teach/TeachPage.tsx`
- `src/components/session/useSession.ts`
- `src/contracts/errors.ts`
- `src/contracts/events.ts`
- `src/contracts/game.ts`
- `src/contracts/types.ts`
- `src/lib/client/__tests__/sse.test.ts`
- `src/lib/client/api.ts`
- `src/lib/client/game-api.ts`
- `src/lib/llm/__tests__/live-demo.test.ts`
- `src/lib/llm/__tests__/turn-failure.test.ts`
- `src/lib/llm/live.ts`
- `src/lib/llm/provider.ts`
- `src/lib/llm/routes/backend.ts`
- `src/lib/llm/routes/handlers.ts`
- `src/lib/llm/routes/prisma-backend.ts`
- `src/lib/server/__tests__/change-character.test.ts`
- `src/lib/server/change-character.ts`
- `src/lib/server/http.ts`
- `src/lib/server/material-dto.ts`
- `src/lib/server/request-diagnostics.ts`
- `src/lib/server/run-access.ts`
- `src/lib/server/run-dto.ts`
- `src/lib/server/run-life.ts`
- `src/lib/server/session-access.ts`
- `src/lib/server/session-dto.ts`
