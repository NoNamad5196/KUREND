# KUREND — B 작업 분담 (B1 / B2)

> B(세션 화면 전부)를 두 사람이 나눈다. **B1 = 기존 B 세션(Claude)**, **B2 = 신규 팀원**. 아래 분담표의 디렉터리만 각자 수정한다.
> 서비스명은 **KUREND**, AI 캐릭터 이름은 "새내기". 설계서 §3·§5·§6 계약은 FROZEN.


## 현재 상태 (B1, 2026-10-01 15:40)
- ✅ 푸시됨: mock API 전체(`/api/mock/**`, `src/mocks/**`), `Mascot`(KU 황소), `SpeechBubble`, `StepperHeader`, `ObjectivesPanel`, `SourceDrawer`, `SourcePeekButton`, `TypingText`, `session.css`(모션 클래스), `/session/[id]/prepare`, `/session/[id]/teach`, `/login`(KUREND 로그인 UI).
- ✅ 검증: typecheck·lint·build 통과, curl 로 준비→되물음→설명→시험 답안→채점→튜터→되짚기→완료 전체 루프 확인, Playwright E2E(1280×800·390×844).
- B2 는 바로 `exam → result → review → complete` 화면을 mock 위에서 만들면 된다. 완료 화면은 `/session/sess_done/complete` 로 바로 확인 가능.
- 시험 화면을 처음부터 보려면: `/session/<새 id>/prepare` → 설명 1~2번 → [그만 가르치고 시험 보기] → `/exam`.
- 모션 클래스(session.css): `kurend-pop`(팝 등장), `kurend-rise`(아래서 올라옴), `kurend-doubt`(흔들림+글로우), `kurend-stagger`(자식 순차 등장), `kurend-mark`(하이라이트 깜빡), `kurend-float`, `kurend-sheen`.
- **마스코트 변경**: 학사모 캐릭터 → **KU 황소**(초록 KU 반다나). `import { Mascot } from "@/components/mascot/Mascot"` 그대로 쓰면 된다. 상태별 소품: doubt `?`+땀, thinking 말줄임 점, writing 연필, praise 반짝이+박수, cheer 점프+컨페티, encourage 하트+손 흔들기.
- `/login` 은 A 의 영역이지만 요청에 따라 B1 이 `components/auth/LoginScreen` 을 만들었다. A 브랜치 머지 시 `src/app/login/page.tsx` 는 `<LoginScreen />` 한 줄 버전을 유지한다(Google OAuth 는 추후).

## 분담표

| 항목 | B1 (기존 세션) | B2 (신규 팀원) |
|---|---|---|
| 화면 | `/session/[id]/prepare`, `/session/[id]/teach` | `/session/[id]/exam`, `/result`, `/review`, `/complete` |
| 라우트 파일 | `src/app/session/[id]/{layout.tsx,prepare,teach}/**` | `src/app/session/[id]/{exam,result,review,complete}/**` |
| 컴포넌트 | `src/components/mascot/**`, `src/components/session/**` (공용 + `prepare/`, `teach/`) | `src/components/exam/**` (AnswerSheet, RecallPanel, ViewSettings, ReportCard, verdict + 페이지 본체 `pages/`) |
| mock API | `src/mocks/**`, `src/app/api/mock/**` 전부 | 없음 (mock 버그·요청은 B1에게) |
| 브랜치 | `claude/kind-dijkstra-ppm05j` | `feat/b2-exam` (B1 브랜치에서 분기, PR로 합침) |
| 커밋 접두사 | `feat(b):` | `feat(b2):` |

## 순서와 의존성
1. **B2가 지금 바로 할 수 있는 것**: `src/components/exam/**` 의 컴포넌트 5종 (아래 §4 시그니처). 의존은 `src/contracts/types.ts`, `src/components/session/ui.tsx`, `src/components/session/TypingText.tsx` 뿐이며 모두 이미 푸시됨.
2. **B1이 먼저 푸시하는 것(약 1시간 내)**: mock API 전체(§3), `Mascot`, `SpeechBubble`, `StepperHeader`, `ObjectivesPanel`, `SourceDrawer`, `SourcePeekButton`(§4). B2 페이지는 이걸 import 한다. 머지 전에는 §4 시그니처를 믿고 코드를 쓰면 된다.
3. B2 페이지 4개: `exam` → `result` → `review` → `complete` 순서 권장 (설계서 §8-8 ~ §8-11). 페이지 본체는 `src/components/exam/pages/{ExamPage,ResultPage,ReviewPage,CompletePage}.tsx` 에 두고 `src/app/session/[id]/<page>/page.tsx` 는 §5 규약대로 얇게.
4. 로컬 실행: `cp .env.example .env.local` 후 `NEXT_PUBLIC_API_BASE=/api/mock` 으로 바꾸고 `pnpm dev`. 홈(`/`)에 데모 세션 링크가 있다. 완료 화면은 `/session/sess_done/complete` 로 바로 확인 가능.
5. 완료 기준(B2): mock 으로 §10 시나리오 4~5단계(시험 관전 → 채점 → 되짚기 → 완료)가 끝까지 재생되고, `pnpm typecheck`·`pnpm lint`·`pnpm build` 통과, 1280×800·390×844 가로 스크롤 없음.

## B2 의 AI 에게 붙여 넣을 지시서
> 다음은 해커톤 프로젝트 **KUREND**(저장소 `/…/kku_hackerton`, Next.js 15 App Router + TypeScript + Tailwind v4)의 설계 브리프다. 너는 **B2** 역할만 구현한다: `src/app/session/[id]/{exam,result,review,complete}/**` 와 `src/components/exam/**` 만 생성·수정한다. `src/contracts/**` 는 FROZEN 이며 절대 바꾸지 않는다. 그 외 파일(특히 `src/components/session/**`, `src/mocks/**`, `src/app/api/mock/**`)은 읽기만 하고 수정하지 않는다. 필요한 공용 컴포넌트가 아직 없으면 아래 §4 시그니처대로 import 만 해 두고 B1 머지를 기다린다. 의존성 추가 금지. 각 단계 끝에 `pnpm typecheck` 와 `pnpm lint` 가 통과해야 한다. 커밋 접두사는 `feat(b2):`. 설계서 원문(§8-8~§8-11, §5, §6, §10)과 아래 브리프 전체를 읽고 시작하라.

---

## 0. 절대 규칙
- 각자 분담표의 디렉터리만 생성/수정한다. 그 외 파일(contracts, globals.css, layout, package.json 등)은 **읽기만**. 의존성 추가 금지.
- `src/contracts/types.ts`, `src/contracts/events.ts` 는 FROZEN. 여기 타입/zod 를 import 해서 쓴다. 필드명을 바꾸거나 새 필드를 응답에 끼워 넣지 않는다.
- 검증은 `pnpm typecheck` 와 `pnpm lint` 만 실행한다. **`pnpm build` / `pnpm dev` 는 실행하지 않는다** (다른 에이전트와 동시 실행 시 `.next` 충돌). 단, 명시적으로 E2E 검증을 맡은 에이전트만 예외.
- 자기 과제에 배정된 파일만 만든다. 다른 에이전트가 만드는 파일이 필요하면 **이 브리프의 시그니처를 믿고 import** 하고, 실제 파일이 아직 없으면 typecheck 실패는 보고만 한다 (임시 stub 를 만들어 남의 파일 경로를 선점하지 않는다).
- 모든 UI 문구는 한국어. 코드 주석도 한국어 OK. `"use client"` 는 훅/상태를 쓰는 컴포넌트에만.
- 디자인: 종이 느낌의 차분한 캠퍼스 노트 톤. 아래 토큰 유틸리티만 사용 (임의 색상 hex 를 새로 만들지 말 것).

## 1. 이미 있는 기반 파일 (읽고 그대로 사용)
- `src/contracts/types.ts` — 모든 DTO 타입 + zod. 주요: `SessionDto`, `ResultDto`, `GapDto`, `ExamDto`, `ExamQuestionDto`, `MessageDto`, `ObjectiveDto`, `AnswerSentenceDto`, `GradeDto`, `TutorMessageDto`, `MaterialDto`, `ChapterDto`, `SourceContentDto`, `HomeDto`, `SessionListItemDto`, `StartExamResponse`, `FinishExplanationResponse`, `ReviewedResponse`, `CompleteResponse`, `CreateSessionResponse`, 상수 `STAGE_LABELS`, `stageLabelFor()`, `finalVerdictFor(totalScore, gapCount)`, `TUTOR_PRESET_REQUEST`.
- `src/contracts/events.ts` — `SseEvent` 유니온, `SseEventName`, `SseEventData<N>`.
- `src/components/session/_api.ts` — `api.get/post/patch/del/upload`, `sse(url, init, onEvent, signal?)`, `routeForSession(session)`, `ApiError`, `base()`. `NEXT_PUBLIC_API_BASE`(기본 `/api`, B 로컬은 `/api/mock`) 가 자동으로 앞에 붙으므로 호출 시에는 `"/sessions/{id}"` 처럼 base 없는 경로를 넘긴다.
- `src/components/session/useSession.ts` — `useSession(sessionId, allowed)` → `{ session, setSession, loading, error, redirecting, reload }`. `allowed` 는 상태 배열 또는 `(s)=>boolean`. 허용 외 상태면 `routeForSession` 경로로 `router.replace`.
- `src/components/session/ui.tsx` — 임시 셸 프리미티브: `Card({paper?})`, `Button({variant: primary|secondary|ghost|danger, size, loading})`, `Chip({tone: default|primary|accent|danger|ok|warn|muted})`, `Stepper({steps?, current})` + `SESSION_STEPS`, `PageHeader({title, subtitle, back, chip, right})`, `EmptyState`, `toast(message, tone?)` + `<Toaster/>`, `Modal`, `ConfirmDialog`, `Drawer({open,onClose,title,children,width?})`, `ProgressBar({value,max})`, `Spinner`.
- `src/app/globals.css` — 토큰. Tailwind 유틸리티: 색 `bg-bg bg-surface text-ink text-muted border-line bg-primary text-primary-ink bg-primary-soft text-primary bg-accent bg-accent-soft text-danger bg-danger-soft text-warn text-ok bg-paper text-paper-ink border-paper-rule`, 반경 `rounded-card rounded-sm`, 그림자 `shadow-card`, 손글씨 `font-hand`.
- `src/app/session/[id]/layout.tsx` — 세션 페이지 공통 레이아웃(컨테이너 + `<Toaster/>`). 이미 존재.

## 2. 데모 시나리오 정본 (fixture 는 반드시 이 내용과 일치)
### 자료/챕터
- 자료 `mat_econ` "경제학원론 수요·공급", courseName "경제학원론", examDate "2026-10-13", status READY, source `src_econ`(kind MD, fileName "econ-demand-supply.md").
  - 챕터: `chp_econ_1` order 1 "수요의 이해" points ["수요 법칙","수요량 변화와 수요 변화","수요 변화 요인"] (startOffset 0, endOffset = src_econ 본문 중 1장 범위 끝), `chp_econ_2` "공급의 이해", `chp_econ_3` "시장 균형", `chp_econ_4` "탄력성".
- 자료 `mat_os` "4장 프로세스 스케줄링", courseName "운영체제", examDate "2026-10-08", source `src_os`. 챕터 6개: `chp_os_1` "프로세스와 스레드", `chp_os_2` "스케줄링 기준", `chp_os_3` "CPU 스케줄링 알고리즘", `chp_os_4` "우선순위와 기아", `chp_os_5` "다단계 큐", `chp_os_6` "멀티프로세서 스케줄링". chp_os_1, chp_os_3 는 taughtAt 있음.
- `src_econ` 본문: 한국어 강의노트 형식 3,000~4,500자. 1장 "수요의 이해" 에 아래 문장이 **그대로** 들어가야 한다(gap 의 sourceExcerpt 로 인용되므로 정확히 일치):
  - "수요 법칙이란 다른 조건이 일정할 때 가격이 오르면 수요량이 줄고, 가격이 내리면 수요량이 늘어나는 역관계를 말한다."
  - "따라서 수요 곡선은 오른쪽 아래로 내려가는 우하향의 형태를 가진다."
  - "수요량의 변화는 그 상품의 가격이 변할 때 일어나며, 수요 곡선 위의 한 점에서 다른 점으로 이동하는 것으로 나타난다."
  - "수요의 변화는 가격 이외의 요인이 변할 때 일어나며, 수요 곡선 자체가 오른쪽 또는 왼쪽으로 이동한다."
  - "소득이 증가할 때 수요가 증가하는 재화를 정상재, 반대로 수요가 감소하는 재화를 열등재라고 한다."
  - "대체재의 가격이 오르면 이 상품의 수요는 증가한다."
  - "보완재의 가격이 오르면 이 상품의 수요는 감소한다."
  - 그 외 기호·선호, 미래 가격 기대, 구매자 수 요인도 서술. 2~4장(공급, 균형, 탄력성)은 짧게.

### 세션 `sess_demo` (경제학 데모, 초기 PREPARING, EASY)
- objectives: o1 "수요 법칙(가격과 수요량의 역관계)을 설명할 수 있다", o2 "수요량의 변화와 수요의 변화를 구분할 수 있다", o3 "소득·대체재·보완재가 수요에 미치는 영향을 설명할 수 있다"
- exam 문항(prepare 완료 시 생성, status READY): q1 (34점, o1) "수요 법칙이란 무엇이며, 가격이 오를 때 수요량은 어떻게 변하는지 설명하시오." / q2 (33점, o2) "수요량의 변화와 수요의 변화는 어떻게 다른지, 수요 곡선에서 각각 어떻게 나타나는지 설명하시오." / q3 (33점, o3) "소득이 증가하거나 대체재 가격이 오를 때 수요가 어떻게 변하는지 설명하시오."
- 첫 질문(JUNIOR QUESTION): EASY "선배, 수요 법칙부터 알려줄래? 가격이랑 수요량이 무슨 관계인지 궁금해." / HARD "수요 법칙부터 말해 줘. 받아쓸게."
- **알 수 없는 sessionId 로 GET 이 오면** chp_econ_1 기준 PREPARING/EASY 세션을 그 id 로 자동 생성한다 (딥링크/새로고침 안전).

### 개념 사전 (heardConcepts 추출, 사용자 설명에 정규식 적용)
| 개념 | 정규식 | objective |
|---|---|---|
| 수요 법칙 | `/수요\s*(의\s*)?법칙\|역관계\|반비례\|(가격\|값)[^.。\n]{0,12}(오르\|올라\|상승)[^.。\n]{0,30}(줄\|감소\|적게\|덜)\|(가격\|값)[^.。\n]{0,12}(내리\|떨어\|하락)[^.。\n]{0,30}(늘\|증가\|많이\|더)/` | o1 |
| 수요 곡선 | `/수요\s*곡선\|우하향/` | o1 |
| 수요량의 변화 | `/수요량의\s*변화\|곡선\s*(상\|위)(의\|에서)?\s*(이동\|움직)/` | o2 |
| 수요의 변화 | `/수요의\s*변화\|곡선\s*(자체\|전체)?(가\|이)?\s*(이동\|움직)\|곡선이\s*(왼\|오른)/` | o2 |
| 소득 | `/소득/` | o3 |
| 정상재 | `/정상재/` | o3 |
| 열등재 | `/열등재/` | o3 |
| 대체재 | `/대체재/` | o3 |
| 보완재 | `/보완재/` | o3 |
| 기호·선호 | `/기호\|선호\|취향\|유행/` | o3 |
| 미래 가격 기대 | `/기대\|예상/` | o3 |
| 구매자 수 | `/구매자\|소비자\s*수\|인구/` | o3 |
- coveredObjectives = 들은 개념이 하나라도 속한 objective 들 (누적).

### 되묻기(doubt) 규칙 — juniorLevel EASY 에서만, 개념 추출보다 먼저 검사. doubt 면 heardConcepts 에 아무것도 추가하지 않고 DOUBT 메시지만 저장, 턴 종료.
1. `/(가격|값)[^.。\n]{0,12}(오르|올라|상승|비싸)[^.。\n]{0,25}(수요량?|소비|구매)[^.。\n]{0,12}(늘|증가|많이|더\s*사)/` → "어? 가격이 오르는데 더 산다고? 나는 반대로 들은 것 같은데… 한 번만 더 설명해줄래?"
2. `/(가격|값)[^.。\n]{0,12}(내리|떨어|하락|싸)[^.。\n]{0,25}(수요량?|소비|구매)[^.。\n]{0,12}(줄|감소|적게|덜)/` → "어? 가격이 내리는데 덜 산다고? 나는 반대로 들은 것 같은데… 한 번만 더 설명해줄래?"
3. `/수요\s*곡선[^.。\n]{0,15}우상향/` → "어? 수요 곡선이 오른쪽 위로 올라간다고? 나는 반대로 들은 것 같은데… 한 번만 더 설명해줄래?"
4. `/소득[^.。\n]{0,12}(늘|증가)[^.。\n]{0,20}정상재[^.。\n]{0,20}(줄|감소)/` → "어? 소득이 늘면 정상재를 덜 산다고? 나는 반대로 들은 것 같은데… 한 번만 더 설명해줄래?"
- 정답/자료 내용은 절대 말하지 않는다 (위 문구 그대로).

### 반응(REACTION) 문장 — added 개념별, 1~3문장, 각 ≤40자
수요 법칙 "가격이 오르면 수요량이 줄어드는 거구나." · 수요 곡선 "그래서 수요 곡선이 오른쪽 아래로 내려가는구나." · 수요량의 변화 "가격이 바뀌면 곡선 위에서만 움직이는 거네." · 수요의 변화 "다른 게 바뀌면 곡선 자체가 옮겨 가는구나." · 소득 "소득이 바뀌어도 수요가 움직이는구나." · 정상재 "정상재는 소득이 늘면 더 사는 거네." · 열등재 "열등재는 소득이 늘면 오히려 덜 사는구나." · 대체재 "대체재 가격이 오르면 이쪽 수요가 늘어나는 거구나." · 보완재 "보완재는 같이 쓰는 거라 반대로 움직이네." · 기호·선호 "유행을 타면 수요가 늘어나는 거구나." · 미래 가격 기대 "나중에 오를 것 같으면 지금 더 사는구나." · 구매자 수 "사는 사람이 많아지면 수요도 커지는구나." · (added 없음) "음… 그 부분은 좀 헷갈리네." + "다시 한 번 들어볼게."
HARD 는 반응 1문장만, 말투 "…라고. 받아썼어."

### 다음 질문 — 아직 안 다룬 objective 중 첫 번째
- o1 EASY "선배, 수요 법칙부터 알려줄래? 가격이랑 수요량이 무슨 관계인지 궁금해." / HARD "수요 법칙부터 말해 줘. 받아쓸게."
- o2 EASY "그럼 '수요량이 변한다'랑 '수요가 변한다'는 다른 말이야? 수요 곡선에서는 어떻게 보여?" / HARD "수요량의 변화와 수요의 변화 차이, 말해 줘. 받아쓸게."
- o3 EASY "가격 말고 소득이 늘거나 다른 물건 값이 바뀌면 수요는 어떻게 돼?" / HARD "소득이랑 대체재·보완재가 수요에 주는 영향, 말해 줘."
- 전부 다룸: EASY "응응, 더 말해 줘! 궁금한 거 생기면 물어볼게." / HARD "더 말해 줘. 받아쓸게."

### 시험 답안 (문항별 문장 템플릿; 해당 개념을 들었을 때만 포함. ref = 그 개념이 처음 등장한 USER 메시지의 1-base 순번. level: 그 USER 메시지가 30자 이상이면 STRONG, 아니면 FAINT)
- q1: [수요 법칙] "수요 법칙은 가격이 오르면 수요량이 줄고, 가격이 내리면 수요량이 늘어나는 역관계를 말합니다." · [수요 곡선] "그래서 수요 곡선은 오른쪽 아래로 내려가는 우하향 모양입니다."
- q2: [수요량의 변화] "수요량의 변화는 그 상품의 가격이 변할 때 생기며, 수요 곡선 위에서 점이 이동하는 것으로 나타납니다." · [수요의 변화] "수요의 변화는 가격 이외의 요인이 변할 때 생기며, 수요 곡선 자체가 왼쪽이나 오른쪽으로 이동합니다."
- q3: [소득|정상재|열등재 중 하나라도] "소득이 증가하면 정상재의 수요는 증가하고, 열등재의 수요는 감소합니다." · [대체재] "대체재의 가격이 오르면 이 상품의 수요는 증가합니다." · [보완재] "보완재의 가격이 오르면 이 상품의 수요는 감소합니다."
- 포함 문장 0개 → unlearned: 문장 1개 "이 부분은 선배한테 못 들어서 모르겠습니다." ref null, level NONE, unlearned true.
- thought(≤30자): 들은 게 있으면 "선배가 말해준 거 떠올려 보자…", 없으면 "이건… 들은 적이 없는데…"
- answer.sources: 그 문항 문장들의 ref 에 해당하는 USER 메시지들. 매칭 0개면 모든 USER 메시지(없으면 빈 배열).

### 채점 (rubric 요소별 가중치, 들은 개념 기준)
- q1: 수요 법칙 24 + 수요 곡선 10 = 34 · q2: 수요량의 변화 17 + 수요의 변화 16 = 33 · q3: (소득|정상재|열등재) 11 + 대체재 11 + 보완재 11 = 33
- verdict: 만점 CORRECT / 0 WRONG / 그 외 PARTIAL. comment ≤120자: 맞은 요소와 빠진 요소를 명시 (예: "수요 법칙의 역관계는 정확합니다. 수요 곡선이 우하향한다는 점이 빠졌습니다.").
- gap: verdict≠CORRECT 문항마다 1개. title ≤25자(예 "수요 곡선의 모양이 빠짐"), diagnosis 3~5문장(새내기 답안의 어떤 부분이 자료와 다르거나 빠졌는지 → 사용자 설명 [ref n] 에서 비롯됐는지, 없으면 "설명에서 다루지 않음"), evidenceQuote = 그 문항에 쓰인 USER 메시지 원문(없으면 ""), concepts = 빠진 요소명 배열, sourceExcerpt = §2 의 정본 문장 중 빠진 요소에 해당하는 것(정확히 일치).
- totalScore = Σscore, finalVerdict = `finalVerdictFor(totalScore, gapCount)`.

### 튜터 응답 (gap 의 빠진 개념별 템플릿, 4~6문장, 쉬운 비유 1개, 마지막 문장은 "이것만 기억하면 됩니다: …"). 사용자가 content 를 보내면 첫 문장에 "좋은 질문이에요. " 를 붙이고 같은 템플릿. request 는 content 또는 `TUTOR_PRESET_REQUEST`.

### 완료된 fixture 세션 `sess_done` (운영체제 · chp_os_3 "CPU 스케줄링 알고리즘", mat_os)
- status COMPLETED, juniorLevel EASY, score 94, finalVerdict MOSTLY, gapCount 1, completedAt/updatedAt 2026-09-30T13:20:00Z.
- objectives 3개(FCFS/SJF, RR 과 타임 퀀텀, 우선순위 스케줄링과 기아), 메시지 6개(JUNIOR QUESTION ↔ USER ANSWER ↔ JUNIOR REACTION/QUESTION), exam GRADED: q1 34/34 CORRECT, q2 33/33 CORRECT, q3 27/33 PARTIAL. gap 1개(q3, "에이징 설명이 빠짐", status REVIEWED, tutorMessages 1개). chapter taughtAt = completedAt, stableAt null.
- 결과 객체(ResultDto) 도 전부 채워서 `/result` 와 `/complete` 가 데이터로 꽉 차 보이게.

## 3. mock API 동작 규칙 (`src/app/api/mock/**`, `src/mocks/**`)
- 경로는 §5 의 `/api/…` 를 `/api/mock/…` 로 그대로 복제. 응답 필드는 contracts 타입과 정확히 일치. 오류는 `{error:{code,message}}` + 404/409/401/400.
- 상태는 서버 메모리(`globalThis.__kurendMock`) 에 저장해 HMR/요청 간 유지. 재시작하면 fixture 초기값으로.
- SSE: `src/mocks/sse.ts` 의 `createMockSse()` → `{ response, send(event, data), close() }`. 첫 줄 `: connected\n\n`, 15초 ping, 마지막은 항상 `event: done`. 재생 간격: 주요 이벤트 300ms, progress 단계 700ms, `junior.token`/`answer.token` 문장 단위 300ms, `answer.thought`/`tutor.token` 글자 단위 35ms, `grading`→`grade` 600ms. 클라이언트 abort 시 타이머 정리.
- 상태 전이(§4) 위반은 409 `INVALID_STATE`. 세션 없음 404 `NOT_FOUND`(단, GET /sessions/{id} 와 prepare 는 자동 생성 규칙 적용). 본문 검증 실패 400 `VALIDATION`.
- 라우트별:
  - `GET /sessions/{id}/prepare`: PREPARING → progress(OBJECTIVES "학습 목표를 정하는 중", QUESTIONS "시험 문제를 만드는 중", GREETING "첫 질문을 준비하는 중") → objectives/exam(READY)/첫 QUESTION 저장 → EXPLAINING/QUESTION → `ready{session}` → `done`. 이미 EXPLAINING 이상이면 즉시 `ready` 1개 + `done`.
  - `POST /explanations {content}`: EXPLAINING & phase QUESTION 만. USER ANSWER 저장 → `user.saved` → (doubt 검사: EASY & 모순) → `junior.doubt{messageId,content}` 저장 후 `done` / 아니면 `junior.concepts{heardConcepts,added}` → 반응 문장마다 `junior.token{token}` → `junior.message{messageId,stage:"REACTION",content(문장 join " ")}` → `junior.question{messageId,content,coveredObjectives}` → `done`.
  - `POST /finish-explanation`: EXPLAINING, USER 메시지 ≥1 아니면 409 `NO_EXPLANATION`. phase EXAM_READY. 이미 EXAM_READY 면 같은 응답(멱등).
  - `POST /start-exam`: EXPLAINING/EXAM_READY → EXAM_IN_PROGRESS, exam IN_PROGRESS. 응답 `{status, exam:{examId, questions}}` (rubric 제외).
  - `POST /exam/answers {qid}`: EXAM_IN_PROGRESS. 이미 답했으면 `answer.recap{qid,sentences}` → `answer.saved{cached:true}` → (전부 답함이면 `exam.completed`) → `done`. 아니면 `answer.sources` → `answer.thought` 글자 단위(마지막 글자 closed:true) → 문장마다 `answer.token{qid,token}` 후 `answer.recall{qid,ref,level,unlearned}` → ExamAnswer 저장 → `answer.saved{qid,answer,cached:false}` → 3개 다 답함이면 `exam.completed{examId}` → `done`.
  - `POST /evaluate`: EXAM_IN_PROGRESS & 3개 답함. EVALUATING 전이 → 문항마다 `grading{qid}` → `grade{...}` → gap 들 `gap{GapDto}` → score/finalVerdict 저장, RESULT_READY, exam GRADED → `result{totalScore,finalVerdict,gapCount}` → `done`.
  - `GET /result`: RESULT_READY/REVIEWING/COMPLETED 만 (그 외 409).
  - `POST /gaps/{gapId}/reviewed`: RESULT_READY/REVIEWING → REVIEWING, gap REVIEWED, `{gapId,status:"REVIEWED",remaining}`.
  - `POST /complete`: RESULT_READY/REVIEWING → COMPLETED, completedAt; chapter.taughtAt 없으면 now; open gap 0 이면 stableAt=now. 응답 `CompleteResponse`.
  - `POST /tutor {gapId, content?}`: RESULT_READY/REVIEWING. `tutor.token` 글자 단위 → `tutor.message{id,gapId,request,response}` 저장 → `done`.
  - `GET/PATCH/DELETE /sessions/{id}`, `GET/POST /sessions`, `GET /sources/{id}/content`, 그리고 §5-2~5-4 (auth, home, materials, generate SSE).
- `GET /materials/{id}` 의 chapter.action: 진행 중 세션 있으면 CONTINUE(sessionId,status), 완료만 있으면 RETRY, 없으면 START.

## 4. 공유 컴포넌트 시그니처 (만드는 쪽은 정확히 이 props 로, 쓰는 쪽은 이대로 import)
```ts
// src/components/mascot/Mascot.tsx
export type MascotState = "idle"|"thinking"|"doubt"|"writing"|"praise"|"cheer"|"encourage";
export function Mascot(props: { state?: MascotState; size?: number /* px, 기본 120 */; typing?: boolean /* "…" 인디케이터 */; className?: string; label?: string /* aria-label */ }): JSX.Element
// ✅ 구현됨: KU 황소 캐릭터 인라인 SVG(mascot-svg.ts) + mascot.css 상태별 모션. size 는 가로 px(세로는 ×1.125).

// src/components/session/SpeechBubble.tsx
export function SpeechBubble(props: { speaker?: string /* 예 "새내기 · 질문" */; tone?: "default"|"doubt"|"user"|"muted"|"paper"; size?: "md"|"lg"; tail?: "left"|"top"|"bottom"|"none"; className?: string; children: React.ReactNode }): JSX.Element
// doubt = 노란(accent-soft) 말풍선. user = primary-soft. lg = 큰 글씨(최신 질문용).

// src/components/session/TypingText.tsx
export function TypingText(props: { text: string; speedMs?: number /* 기본 20 */; instant?: boolean; cursor?: boolean; onDone?: () => void; className?: string; as?: "span"|"p"|"div" }): JSX.Element
// text 가 늘어나면(문장 추가) 처음부터 다시 치지 않고 이어서 친다. instant 또는 prefers-reduced-motion 이면 즉시 전체 표시. 타이핑이 끝나면 onDone(마지막 글자 기준 1회).

// src/components/session/StepperHeader.tsx
export function StepperHeader(props: { session: Pick<SessionDto,"material"|"chapter">; step: 1|2|3|4; chipLabel: string; subtitle?: string; right?: React.ReactNode; className?: string }): JSX.Element
// ← {material.title} (href `/materials/{materialId}`), Chip(chipLabel), 챕터 제목, 부제, Stepper(SESSION_STEPS, current=step)

// src/components/session/ObjectivesPanel.tsx
export function ObjectivesPanel(props: { objectives: ObjectiveDto[]; covered: string[]; heardConcepts: string[]; className?: string; collapsible?: boolean }): JSX.Element
// "학습 목표 3개"(covered 면 ✓ 초록) + "새내기가 들은 개념" Chip 들(없으면 "아직 들은 개념이 없어요")

// src/components/session/SourceDrawer.tsx
export function SourceDrawer(props: { open: boolean; onClose: () => void; materialId: string; chapterId: string; highlight?: string; title?: string }): JSX.Element
// 열릴 때 GET /materials/{materialId} → 해당 chapter 의 sourceId/startOffset/endOffset → GET /sources/{sourceId}/content → text.slice 범위만 표시(문단 유지, whitespace-pre-wrap). highlight 가 있으면 그 문자열에 <mark class="bg-accent-soft"> 하이라이트 + 열릴 때 그 위치로 scrollIntoView. 로딩/오류 상태 표시.

// src/components/session/SourcePeekButton.tsx
export function SourcePeekButton(props: { materialId: string; chapterId: string; className?: string }): JSX.Element
// "자료 보기" 버튼 → Modal("자료를 보면서 설명하면 아는 것 같은 착각이 들기 쉽습니다. 막힐 때만 잠깐 보세요." [자료 보기][계속 설명]) → [자료 보기] 선택 시 SourceDrawer 열기.

// src/components/exam/AnswerSheet.tsx
export type AnswerSheetItem = { qid: string; order: number; points: number; question: string; text: string; unlearned?: boolean; status?: "pending"|"writing"|"done"; badge?: React.ReactNode /* 문항 머리 우측 칩 자리 (채점 전/점수) */; extra?: React.ReactNode /* 문항 아래 영역 (채점 소견 등) */ };
export function AnswerSheet(props: { courseName: string; title?: string /* 기본 "2026학년도 KUREND 학력평가 답안지" */; items: AnswerSheetItem[]; activeQid?: string | null; instant?: boolean; typingSpeedMs?: number /* 기본 30 */; onTypingDone?: (qid: string) => void; className?: string }): JSX.Element
// 종이 카드(bg-paper, border-paper-rule). 머리: 제목 + 표 [성명 | 새내기] [과목 | courseName] [배점 | 100]. 문항: "1. [34점] 질문" + badge. 답란: 줄노트(repeating-linear-gradient 로 paper-rule 줄) 위 font-hand 손글씨. activeQid 문항은 TypingText 로 타이핑(status "writing"), 나머지는 즉시 표시. unlearned 면 답안에 빨간 밑줄(decoration-danger) + Chip(tone danger) "못 들은 부분". extra 는 답란 아래.

// src/components/exam/RecallPanel.tsx
export function RecallPanel(props: { sources: Array<{ ref: number; content: string }>; highlights: Record<number, RecallLevel>; unlearned?: boolean; className?: string; title?: string /* 기본 "새내기가 떠올리는 내 설명" */ }): JSX.Element
// ref 별 카드 "내 설명 #n" + 내용. highlights[ref] STRONG → bg-accent-soft 진한 테두리, FAINT → 연한 accent-soft/50. unlearned 면 상단에 Chip danger "못 들은 부분" 안내. sources 비면 "떠올릴 설명이 없어요".

// src/components/exam/ViewSettings.tsx
export type ExamViewSettings = { showThought: boolean; instant: boolean; autoAdvance: boolean };
export function useExamViewSettings(): [ExamViewSettings, (patch: Partial<ExamViewSettings>) => void]; // localStorage "kurend.examView", SSR 안전(기본 {showThought:true, instant:false, autoAdvance:false})
export function ViewSettingsMenu(props: { value: ExamViewSettings; onChange: (patch: Partial<ExamViewSettings>) => void; className?: string }): JSX.Element // "보기 설정 ▾" 드롭다운, 체크박스 3개: 속마음 보기 / 한 번에 보기 / 자동 진행

// src/components/exam/ReportCard.tsx (성적통지표)
export function ReportCard(props: { courseName: string; totalScore: number; questionCount: number; correctCount: number; partialCount: number; wrongCount: number; gapCount: number; finalVerdict: FinalVerdict; className?: string }): JSX.Element
// 종이 카드 "성적통지표": [성명 새내기][과목][총점 94/100][문항 3][정답 2][부분 1][오답 0] / "놓친 곳 N군데" / VerdictChip

// src/components/exam/verdict.tsx
export function VerdictChip(props: { verdict: FinalVerdict; className?: string }): JSX.Element // STABLE "안정" ok 초록 · MOSTLY "대부분 이해" warn 주황 · NEEDS_WORK "보완 필요" muted 회색
export function GradeVerdictChip(props: { verdict: GradeVerdict; className?: string }): JSX.Element // CORRECT "정답" 초록 · PARTIAL "부분" 주황 · WRONG "오답" 빨강
export function GradeBox(props: { grade: GradeDto | null; state: "pending"|"grading"|"done"; className?: string }): JSX.Element // pending "채점 전" 칩 / grading 스피너 "채점 중" / done "28 / 34" + verdict 색 소견 박스
export const VERDICT_LABEL: Record<FinalVerdict, string>; export const GRADE_LABEL: Record<GradeVerdict, string>;
```

## 5. 페이지 공통 규약 (`src/app/session/[id]/<page>/page.tsx`)
```tsx
// page.tsx (서버 컴포넌트, Next 15: params 는 Promise)
import { PreparePage } from "@/components/session/prepare/PreparePage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <PreparePage sessionId={id} />; }
```
- 클라이언트 본체는 `src/components/session/<page>/<Name>Page.tsx` ("use client"). 페이지 전용 하위 컴포넌트는 같은 폴더.
- 진입 시 `useSession(sessionId, allowed)` 로 상태 복원. 허용 상태: prepare [PREPARING] · teach [EXPLAINING && phase QUESTION] · exam [EXPLAINING&&EXAM_READY, EXAM_IN_PROGRESS] · result [EXAM_IN_PROGRESS(3문항 답함), EVALUATING, RESULT_READY, REVIEWING] · review [RESULT_READY, REVIEWING] · complete [COMPLETED].
- SSE 는 `sse()` + `AbortController`; 언마운트 시 abort. `error` 이벤트 → `toast(message,"error")` + 재시도 UI. `ApiError` 409 → toast 후 `reload()` 로 상태 재동기화.
- 로딩: Mascot(thinking) + 안내 문구. 오류: EmptyState + [다시 시도].
- 반응형: 1280×800 과 390×844 에서 가로 스크롤 없음. 보조 패널은 `lg:` 이상에서 우측, 그 아래에서는 토글/아래 배치.
- 접근성: 버튼은 `<Button>`, 라이브 영역에 `aria-live="polite"`.
