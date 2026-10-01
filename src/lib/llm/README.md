# D: LLM 파이프라인과 스트리밍 API

구현 설계서 §7의 `Llm` 인터페이스는 `index.ts`에서 그대로 내보냅니다.
D 기능 코드는 D 소유 영역에 있습니다. 실행 환경 예시는 루트 `.env.example`에
정리했습니다. 공유 계약, UI, 의존성 선언, Prisma 스키마, C의 인증·CRUD API는
수정하지 않습니다.

## 환경 파일과 필요한 값

처음 받았다면 프로젝트 루트에서 `.env.example`을 `.env`로 복사하세요.
기존 `.env`는 유지하고, 파일 접근 권한은 본인만 읽고 쓸 수 있도록 설정합니다.

```bash
if [ ! -e .env ]; then
  (umask 077; cp .env.example .env)
fi
```

`.env`는 Git에서 제외되며 예시 파일에만 기본값을 공유합니다.
Next.js는 `dev`/`build`/`start` 시 `.env`를 읽습니다. 같은 이름의 프로세스 환경 변수나
`.env.local` 등의 설정이 있으면 `.env`보다 우선하므로 변경 후 서버를 재시작하세요.

| 실행 방식 | 필요한 설정 |
|---|---|
| D 단독 CLI 평가 | `LLM_PROVIDER=stub`; 키와 DB 불필요 |
| OpenAI 평가 | `LLM_PROVIDER=openai`, `OPENAI_API_KEY`; `LLM_MODEL`은 선택 |
| Anthropic 평가 | `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`; `LLM_MODEL`은 선택 |
| 실제 HTTP 서비스 | 위 모델 설정 + `D_STUB_BACKEND=0`, C의 Prisma DB·인증 어댑터 등록 |

`LLM_MODEL`을 비우면 제공자 기본 모델을 사용합니다. `LLM_STUB_DELAY_MS=300`은
문장당 데모 지연이며 자동 검증에서는 `0`을 사용할 수 있습니다.
`DATABASE_URL=file:./dev.db`는 C가 SQLite를 연결할 때 사용하는 예시입니다.
DB 주소를 적는 것만으로 C의 schema·seed·auth 또는 어댑터가 생성되지는 않습니다.

API 키는 해당 제공자의 API 사용 권한·사용량 한도가 유효해야 합니다.
실제 호출에 사용할 호스트는 OpenAI의 `api.openai.com` 또는 Anthropic의
`api.anthropic.com`이며 클라우드 네트워크 설정에서 해당 호스트에 접근할 수 있어야 합니다.

아래 명령은 **`.env`에서 선택한 제공자**로 평가합니다(Node 20.12 이상).
LLM 모듈이 로컬 `.env`를 읽으므로 CLI 평가에도 같은 설정을 사용합니다.
명시적으로 지정한 프로세스 환경 변수가 우선합니다. 실제 제공자는 API 사용량이 발생합니다.

```bash
corepack pnpm@10.30.3 eval:llm
node --import tsx fixtures/eval-demo.ts --require-live
```

## 개발 및 검증

저장소 루트에서 실행합니다. 현재 lockfile v9와 호환되는 pnpm 10.30.3으로 검증합니다.
환경의 기본 pnpm 11은 최근 배포 패키지에 대한 추가 설치 정책을 적용하므로,
아래 명시한 버전을 사용합니다. lockfile과 패키지 무결성 검증은 유지합니다.

```bash
export COREPACK_HOME=/workspace/.cache/corepack
export COREPACK_ENABLE_AUTO_PIN=0
corepack pnpm@10.30.3 install --frozen-lockfile --store-dir /workspace/.pnpm-store-10
export NODE_PATH="$PWD/node_modules/.pnpm/node_modules${NODE_PATH:+:$NODE_PATH}"

LLM_PROVIDER=stub LLM_STUB_DELAY_MS=0 corepack pnpm@10.30.3 eval:llm
LLM_PROVIDER=stub LLM_STUB_DELAY_MS=0 corepack pnpm@10.30.3 exec tsx --test src/lib/llm/__tests__/*.test.ts
corepack pnpm@10.30.3 typecheck
corepack pnpm@10.30.3 build
```

`NODE_PATH`는 현재 공유 ESLint 설정의 FlatCompat가 pnpm의 전이 플러그인
`eslint-plugin-react-hooks`를 찾도록 하는 실행 환경 설정입니다.
공유 설정이나 dependency 선언을 바꾸지 않고 동일한 린트 규칙을 실행합니다.

실제 모델: `LLM_PROVIDER=openai`와 `OPENAI_API_KEY`, 또는
`LLM_PROVIDER=anthropic`과 `ANTHROPIC_API_KEY`를 실행 환경에 설정합니다.
키는 저장소·채팅·명령행 인수에 넣지 마세요. `LLM_MODEL`은 선택 사항이며,
기본 모델은 각각 `gpt-4.1-mini`, `claude-sonnet-4-6`입니다.
JSON 검증 실패는 한 번 재시도하고, 요청 실패를 stub 성공으로 바꾸지 않습니다.
SDK의 별도 자동 재시도는 꺼져 있습니다. 준비는 재시도 포함 18초, 설명 분석은
10초, 나머지 JSON 요청은 30초의 총 대기 시간 제한을 적용합니다. 이는 성공 응답의
속도를 보장하는 수치가 아닙니다. `fixtures/eval-demo.ts`가 경제학 데모의 실제 준비·턴
시간을 출력하며 목표 15초·8초와 비교합니다. `--require-live`는 stub 실행을 거부합니다.
stub 회귀 검증은 `LLM_PROVIDER=stub LLM_STUB_DELAY_MS=0 node --import tsx fixtures/eval-demo.ts`로 실행합니다.

## C의 DB·인증 연결

`routes/backend.ts`가 유일한 연결 경계입니다.
`routes/prisma-backend.ts`의 `createPrismaBackend`에 C의 `db`, `requireUser`,
선택적으로 `toSessionDto`를 전달하고 `installRouteBackend`로 등록합니다.
구체적인 연결 코드는 [routes/INTEGRATION.md](./routes/INTEGRATION.md)를 참고하세요.
등록되지 않은 일반 실행은 명시적으로 실패하므로 임시 DB나 인증으로 바뀌지 않습니다.

현재 main의 `src/instrumentation.ts`가 C의 어댑터를 등록합니다. 등록된 어댑터는
`D_STUB_BACKEND=1`보다 우선하므로 HTTP 실행에는 C의 DB 초기화 및 인증 흐름이
필요합니다. `LLM_PROVIDER=stub`은 모델만 fixture로 바꿉니다. DB 없이 D만 검증할 때는
위 CLI 평가와 라우트 테스트를 사용하세요.

```bash
corepack pnpm@10.30.3 dev --hostname 127.0.0.1
```

DB 설정은 기존 저장소 문서를 따르며, seed는 데이터를 지우므로 사용자 DB에
검증 목적으로 실행하지 마세요. 별도의 테스트 DB와 데모 로그인을 사용합니다.
`D_STUB_BACKEND=1`의 메모리 저장소는 C 어댑터가 등록되지 않은 독립 실행에만
해당하며, 통합 앱에서는 인증·영속 저장소를 대체하지 않습니다.

## 지켜야 하는 동작

- EASY의 모순은 정답 노출 없이 되묻고, 학습 개념을 추가하지 않습니다.
- 설명 턴은 모델 분석 한 번으로 처리합니다. 반응과 되묻기는 사용자의 원문만 인용하고,
  다음 질문은 누적 설명에서 아직 달성하지 않은 목표를 대상으로 합니다.
- 들은 개념과 달성 목표에는 사용자 설명의 실제 원문 근거가 필요합니다.
- 시험 답안 생성에는 질문·사용자 설명·들은 개념만 전달합니다. 원문과 rubric은 전달하지 않습니다.
- 답안은 실제 사용자 설명에서 뽑은 인용으로 작성하며, 배운 근거가 없으면 못 들은 부분으로 답합니다.
- 평가의 정답 근거는 강의자료와 rubric이며, 점수는 34/33/33 합계 100점입니다.
- 튜터는 원문 인용과 문장 형식 검증 후 5문장으로 출력합니다. 비유 전용 문장 하나와
  마지막 `이것만 기억하면 됩니다: …` 문장을 포함합니다. 검증이 끝난 뒤 token/final
  이벤트를 보내므로 첫 토큰까지는 전체 모델 응답을 기다립니다.
- 인증·소유권·상태·입력 오류는 SSE 시작 전에 HTTP 오류로 반환합니다.
- SSE 중 오류는 `error` 후 `done`으로 끝납니다. 재요청 답안은 `answer.recap`으로 복원합니다.
- 동시 쓰기는 상태 비교와 트랜잭션으로 막고, 실패한 평가 상태는 재시도 가능하게 복구합니다.

설계서 §10의 “3번 문항을 못 배움 → 대부분 이해”는 §4의 점수 규칙과 충돌합니다.
1·2번만 만점을 받아도 67점이므로 `NEEDS_WORK`가 맞습니다. 70점 이상으로
임의 조정하지 않습니다.

stub 평가와 통합 테스트가 실제 OpenAI/Anthropic 응답 품질을 검증한 것은 아닙니다.
실제 키를 연결한 후 같은 `eval:llm`을 원하는 provider로 실행해야 합니다.
