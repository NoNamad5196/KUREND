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
| D 단독 데모(기본값) | `LLM_PROVIDER=stub`, `D_STUB_BACKEND=1`; 키와 DB 불필요 |
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

아래 명령은 **`.env`에서 선택한 제공자**로 평가합니다(Node 20.6 이상).
기존 `eval:llm` 스크립트는 `.env`를 자동으로 읽지 않으므로 파일 설정을 검증할 때는
명시적으로 로드해야 합니다. 실제 제공자를 선택하면 유료 API 호출이 발생할 수 있습니다.

```bash
node --env-file=.env --import tsx scripts/eval-llm.ts
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

## C의 DB·인증 연결

`routes/backend.ts`가 유일한 연결 경계입니다.
`routes/prisma-backend.ts`의 `createPrismaBackend`에 C의 `db`, `requireUser`,
선택적으로 `toSessionDto`를 전달하고 `installRouteBackend`로 등록합니다.
구체적인 연결 코드는 [routes/INTEGRATION.md](./routes/INTEGRATION.md)를 참고하세요.
등록되지 않은 일반 실행은 명시적으로 실패하므로 임시 DB나 인증으로 바뀌지 않습니다.

C 구현을 기다리는 동안에는 예시 `.env`의 `LLM_PROVIDER=stub`과
`D_STUB_BACKEND=1`을 유지하고 실행합니다. 별도의 실행 시 환경 변수 지정은 필요 없습니다.

```bash
corepack pnpm@10.30.3 dev --hostname 127.0.0.1
```

이 모드는 메모리 저장소와 `tb_uid=usr_demo1` 데모 쿠키를 사용합니다.
프로세스를 재시작하면 데이터가 초기화됩니다. 실제 인증·영속 저장소 검증을
대체하지 않으며, CRUD·화면 전체의 완주에는 A/B/C 구현이 필요합니다.
운영 실행에서 `D_STUB_BACKEND`를 설정하지 마세요.

## 지켜야 하는 동작

- EASY의 모순은 정답 노출 없이 되묻고, 학습 개념을 추가하지 않습니다.
- 시험 답안 생성에는 질문·사용자 설명·들은 개념만 전달합니다. 원문과 rubric은 전달하지 않습니다.
- 평가의 정답 근거는 강의자료와 rubric이며, 점수는 34/33/33 합계 100점입니다.
- 인증·소유권·상태·입력 오류는 SSE 시작 전에 HTTP 오류로 반환합니다.
- SSE 중 오류는 `error` 후 `done`으로 끝납니다. 재요청 답안은 `answer.recap`으로 복원합니다.
- 동시 쓰기는 상태 비교와 트랜잭션으로 막고, 실패한 평가 상태는 재시도 가능하게 복구합니다.

설계서 §10의 “3번 문항을 못 배움 → 대부분 이해”는 §4의 점수 규칙과 충돌합니다.
1·2번만 만점을 받아도 67점이므로 `NEEDS_WORK`가 맞습니다. 70점 이상으로
임의 조정하지 않습니다.

stub 평가와 통합 테스트가 실제 OpenAI/Anthropic 응답 품질을 검증한 것은 아닙니다.
실제 키를 연결한 후 같은 `eval:llm`을 원하는 provider로 실행해야 합니다.
