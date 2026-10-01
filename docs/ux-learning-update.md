# KUREND 온보딩 · 마이페이지 · 후배별 학습 경험 개선

신규 Google 계정은 최초 가입 직후 짧은 선배 오리엔테이션에서 학습 흐름과 후배별 차이를 이해합니다. 기존 사용자는 온보딩 완료 여부와 관계없이 홈에서 학습을 이어가고, 마이페이지에서 기존 오답노트와 선배의 학습노트를 찾아볼 수 있습니다. 후배 선택은 가르치기 UI와 질문·기억 방식에도 반영됩니다.

## 사용자 흐름

```text
Google 로그인 → 계정 생성 여부 확인
                ├ 첫 가입 → 오리엔테이션 → 첫 자료 올리기 또는 홈
                └ 기존 계정 → 홈 (온보딩 미완료도 동일)

자료 올리기 → AI 목차 정리 → 후배 선택 → 후배에게 가르치기
→ 후배 시험 → 오답 확인·다시 가르치기 → 반복 학습 → 졸업

프로필 → 마이페이지 → 오답노트 / 선배의 학습노트 / 이용 방법 다시 보기 / 로그아웃
```

오리엔테이션은 선배 역할, 가르친 만큼만 배우는 원리, 후배별 방식 비교, 졸업까지의 흐름을 네 단계로 보여 줍니다. 기존 캐릭터 이미지와 공통 UI를 사용하고, 설명 전후 비교와 후배 선택을 직접 체험할 수 있습니다. 홈의 중복 시작 가이드와 다시 보기 링크는 제거했습니다. 다시 보기는 마이페이지의 ‘서비스 이용 방법 다시 보기’에서만 안내합니다.

## 기존 기능 재사용

| 기능 | 재사용한 구현 | 이번 변경 |
| --- | --- | --- |
| 오답노트 | `gameApi.listWrongNotes()`, 기존 `/wrong-notes` 목록·상세·API | 개수, 복습 상태, 최근 항목과 기존 페이지로 가는 링크 추가 |
| 선배의 학습노트 | `/home` 자료 목록, `gameApi.getTeacherNotes(materialId)`, `TeacherNoteBody`, 기존 `TeacherNote` 저장 구조 | 자료별 병렬 조회와 챕터별 펼쳐 보기, 자료별 오류·재시도 제공 |
| 사용자 통계 | 기존 `/home`의 완료 세션·평균 점수·연속 학습 | 마이페이지와 프로필에 기존 통계 표시 |
| 로그아웃 | 기존 `POST /auth/logout`, 공통 API 클라이언트 | 마이페이지 계정 영역으로 진입 위치 정리 |
| 인증 | 기존 `/auth/me`, 인증 쿠키, Google OAuth | 최초 가입 콜백에서만 자동 온보딩 진입. 일반 페이지는 완료 여부와 무관하게 유지 |
| 가르치기 | 기존 explanations API, `Message`, SSE, `heardConcepts`, 시험 답안 생성 | 남학생 선택 문장을 같은 설명 경로로 전달 |
| 기억 상태 | 기존 `ConceptMastery`와 세션 게임 API | 후배별 숙련도 갱신과 새로고침 후 목표 진행 복원 |
| 디자인 | 기존 `Card`, `Button`, `Chip`, `PageHeader`, `JuniorAvatar` | 기존 색상·캐릭터를 유지하며 새 화면 구성 |

노트 허브는 조회만 수행합니다. 마이페이지에 들어가는 것만으로 TeacherNote를 생성하지 않으며, WrongNote·TeacherNote·사용자 통계 모델을 추가하지 않았습니다.

## 계정 단위 최초 1회 처리

`User.onboardingCompletedAt DateTime?`를 추가하고 `/api/auth/me`의 `onboardingCompleted`로 노출합니다. 완료 버튼은 인증된 본인 계정에 `POST /api/auth/onboarding`을 호출합니다. 최초 완료 시각을 보존하므로 반복 요청에도 결과가 유지되며, 새로고침·로그아웃·재로그인 후에도 자동 온보딩이 반복되지 않습니다.

Google OAuth 콜백은 계정을 처음 생성할 때만 `/onboarding?mode=signup`으로 보냅니다. 기존 계정은 완료 기록이 없어도 홈으로 보냅니다. `AppShell`은 일반 페이지에서 온보딩을 강제하지 않습니다. 모드 없는 `/onboarding` 및 알 수 없는 모드는 홈으로, 완료한 계정의 `mode=signup`도 홈으로 보냅니다. 마이페이지의 `/onboarding?mode=replay`는 완료·미완료 계정 모두 열 수 있고, 저장 상태를 바꾸지 않으며 끝에서 마이페이지로 돌아옵니다. 중간에 나가도 일반 탐색이나 재로그인 때 자동으로 다시 뜨지 않습니다.

기존 DB에는 `scripts/upgrade-onboarding.mjs`가 nullable 컬럼을 추가합니다. `User` 컬럼이 처음 추가되는 트랜잭션에서만 기존 계정을 완료 처리하고, 이후 생성된 계정은 `null` 상태를 유지합니다. 재실행으로 신규 계정이 완료 처리되지 않습니다. 가르치기 선택지 보존용 `Message.teachingChoicesJson String?`도 함께 추가합니다.

이 업그레이드는 `pnpm db:push`, `pnpm dev`, `pnpm start`, 기존 Render DB 준비 경로에 연결했습니다. 기존 DB에는 Prisma CLI를 직접 실행하기 전에 업그레이드를 먼저 적용해야 합니다. 개발·테스트 시드의 체험 1은 완료 기록이 있고, 체험 2·3은 완료 기록이 없습니다. 이 기록만으로 자동 온보딩을 시작하지 않으며 운영 로그인 화면에는 체험 계정을 제공하지 않습니다.

## 캐릭터별 가르치기와 시험

| 후배 | 가르치기 UI | 질문·기억 방식 | 시험 | 합격선 | 사용자 호칭 |
| --- | --- | --- | --- | --- | --- |
| 남학생 `MALE_EASY` | 선택형 중심, 보조 액션으로 직접 설명 | 단순한 질문, 알려준 설명을 빠르게 기억. 틀린 선택도 즉시 정답으로 교정하지 않음 | 객관식 4지선다 | 60 | 선배님 |
| 여학생 `FEMALE_NORMAL` | 자유 서술 Composer | 의미·이유를 질문하고 명확한 설명은 한 번에 기억 | 서술형 | 70 | 선배님 |
| KU `KU_HARD` | 자유 서술 Composer와 기억 다지기 표시 | 이해한 내용을 확인하고 같은 개념을 다른 표현으로 재질문 | 이유·비교·응용을 포함하는 서술형 | 80 | 선배 |

후배 선택 카드·준비 화면·온보딩·가르치기 화면은 같은 캐릭터 메타데이터를 사용합니다. 후배 정보를 불러오지 못하면 오류와 재시도를 표시하며, 세션 전환 시 이전 후배의 UI가 잠시 보이지 않도록 조회 상태를 세션별로 구분합니다.

숙련도는 기존 저장 구조를 사용합니다. 남학생·여학생은 인정된 설명으로 해당 목표의 숙련도 100에 도달합니다. KU는 서로 다른 설명을 통해 노출 횟수를 쌓으며 현재 규칙은 1회 50, 2회 100입니다. 공백·문장부호만 다른 동일 설명 재전송은 추가 노출로 세지 않습니다. 서버의 숙련도를 목표와 연결해 새 브라우저에서도 진행 상태를 복원합니다.

### 남학생 선택 → 기존 설명 파이프라인

```text
현재 챕터 원문 → teachingChoices 생성 → JUNIOR/QUESTION에 선택지 보존
→ 사용자가 선택한 text
→ POST /sessions/{id}/explanations { content: text }
→ 기존 USER/ANSWER Message 저장
→ juniorTurn 분석 → heardConcepts·기존 mastery 갱신
→ 반응과 다음 질문 SSE → 가르친 USER 설명을 근거로 후배 시험
```

`teachingChoices`는 시험의 `choices`와 별도 필드입니다. 학습목표·자료안내 문장을 제외한 원문 설명, 그 문장에서 파생한 반대 설명, 모르겠다는 선택을 제공하며 사용자의 답을 채점하지 않습니다. 관련 설명을 찾기 위한 문장 순위만으로 숙련도를 인정하지 않으며, 선택지를 만들 설명이 없으면 직접 설명을 사용할 수 있습니다. 원문과 선택하지 않은 보기는 후배의 반응 생성 입력이나 시험 근거에 새로 전달하지 않습니다. 틀린 선택도 실제 가르친 내용으로 남고, 미학습 선택은 시험 근거나 정답 점수로 인정하지 않습니다.

예전 세션에는 현재 미응답 질문의 선택지만 보강합니다. 기존 시험과 대화 순서를 유지하고, 이름이 겹치는 목표는 가장 구체적인 목표에 연결합니다. 스트림이 끊긴 경우에는 저장된 USER와 후배 응답을 먼저 다시 조회합니다. 이미 저장된 응답은 복구해서 보여 주고, 아직 답하지 않은 설명만 기존 재시도 경로를 사용합니다.

LIFE 차감, GAME OVER, 졸업, 오답노트와 TeacherNote 저장 모델은 기존 흐름을 사용합니다. 시험은 기존 사용자 설명만을 근거로 답하며, 미학습 응답과 호칭 변경으로 잘못 정답 처리되지 않도록 판별을 보완했습니다.

## 호칭 통일 위치

`src/lib/llm/personas.ts`에 캐릭터별 voice·예문, 질문 생성 함수 `personaQuestion`, 직접 대사의 호칭을 보정하는 `normalizePersonaAddress`를 모았습니다. 준비·분석·반응 프롬프트와 live·stub 경로, 준비·다음 질문 저장, 기존 대화·스트리밍·빈 대화 UI에 반영했습니다.

기존 fixture 대사와 저장된 대화도 표시·생성 경로에서 캐릭터 호칭을 적용합니다. 인용된 사용자 설명은 보존하고, “선배의 학습노트”, “선배용 강의노트” 같은 일반 UI 역할명은 유지합니다.

## 수정한 기존 파일 전체 목록

| 파일 | 변경 내용 |
| --- | --- |
| `README.md` | 새 화면·DB 업그레이드 안내와 이 문서 링크 |
| `package.json` | 개발·운영 시작 및 DB 적용 전 비파괴 업그레이드 연결 |
| `prisma/schema.prisma` | 온보딩 완료 시각·메시지 선택지 nullable 컬럼 |
| `prisma/seed.ts` | 기존·신규 체험 계정의 온보딩 상태 |
| `scripts/render-db.mjs` | 기존 Render DB 업그레이드 연결 |
| `src/app/api/a-preview/[...path]/route.ts` | 미리보기 인증의 온보딩 계약 |
| `src/app/api/auth/me/route.ts` | 계정의 온보딩 완료 상태 반환 |
| `src/app/api/mock/auth/demo-accounts/route.ts` | 체험 계정 공개 응답 필드 유지 |
| `src/app/api/mock/auth/me/route.ts` | 모의 인증의 온보딩 완료 상태 |
| `src/app/materials/[id]/page.tsx` | 자료 분석 AI와 후배 학습 역할이 혼동되지 않는 안내 |
| `src/app/page.tsx` | 첫 학습 가이드와 진입 링크 |
| `src/components/auth/LoginScreen.tsx` | 서비스 핵심 학습 루프와 공통 API·UI 사용 |
| `src/components/game/JuniorSelect.tsx` | 후배 카드에 가르치기 방식 표시 |
| `src/components/game/characters.ts` | 캐릭터별 학습 방식·도움말·대사 메타데이터 |
| `src/components/game/useSessionGame.ts` | 세션별 후배 조회 상태·오류·재조회 |
| `src/components/session/prepare/PreparePage.tsx` | 준비 단계의 후배별 안내·호칭 |
| `src/components/session/teach/ChatThread.tsx` | 직접 대사 호칭과 저장된 설명 재시도 상태 |
| `src/components/session/teach/Composer.tsx` | 캐릭터별 입력 안내와 비활성 상태 |
| `src/components/session/teach/TeachPage.tsx` | 선택형·자유 설명 분기, 진행 복원, 재시도, KU 기억 표시 |
| `src/components/shell/AppShell.tsx` | 공통 온보딩 게이트·사용자 컨텍스트·프로필 링크 |
| `src/contracts/events.ts` | 다음 질문 SSE의 선택적 teachingChoices |
| `src/contracts/types.ts` | 온보딩 상태와 가르치기 선택지 계약 |
| `src/lib/llm/__tests__/prisma-backend.test.ts` | 선택지의 DB·DTO 왕복 저장 회귀 검증 |
| `src/lib/llm/live.ts` | 실제 모델 경로의 캐릭터별 질문·선택지·숙련도·호칭 |
| `src/lib/llm/personas.ts` | 캐릭터 규칙과 호칭 공통 함수 |
| `src/lib/llm/prompts/analyze-turn.ts` | 캐릭터별 설명 분석·현재 설명 근거 |
| `src/lib/llm/prompts/prepare-session.ts` | persona가 우선하는 최초 질문 규칙 |
| `src/lib/llm/prompts/respond-turn.ts` | 반응·질문·호칭·지식 범위 지침 |
| `src/lib/llm/routes/handlers.ts` | 선택지 준비·보강·SSE·기존 mastery 전달 |
| `src/lib/llm/routes/prisma-backend.ts` | 선택지 JSON 저장·복원 |
| `src/lib/llm/schemas.ts` | 호칭과 객관식 표기를 고려한 미학습 답안 검증 |
| `src/lib/llm/stub.ts` | 데모 경로의 후배별 학습·선택·시험 근거 |
| `src/lib/llm/text.ts` | 미학습 답안 공통 판별 |
| `src/lib/llm/types.ts` | LLM 입력·출력의 선택지·숙련도 확장 |
| `src/lib/server/auth.ts` | 인증 사용자 조회에 온보딩 상태 포함 |
| `src/lib/server/session-dto.ts` | 기존 세션 응답에 저장된 선택지 포함 |
| `src/mocks/store.ts` | 모의 계정의 온보딩 상태 |

## 새로 추가한 파일 전체 목록

| 파일 | 역할 |
| --- | --- |
| `docs/ux-learning-update.md` | 구현·변경 파일·검증 보고 |
| `scripts/upgrade-onboarding.mjs` | 기존 계정 보존과 nullable 컬럼 추가 |
| `src/app/api/auth/onboarding/route.ts` | 본인 계정의 최초 완료 시각 저장 |
| `src/app/api/mock/auth/onboarding/route.ts` | 같은 계약의 모의 완료 API |
| `src/app/mypage/page.tsx` | 마이페이지 라우트 |
| `src/app/onboarding/page.tsx` | 오리엔테이션 라우트 |
| `src/components/mypage/MyPage.tsx` | 개인 학습 허브·기존 통계·계정 액션 |
| `src/components/mypage/TeacherNoteCollection.tsx` | 자료·챕터별 기존 학습노트 조회 |
| `src/components/mypage/WrongNotesHub.tsx` | 기존 오답노트 요약·진입 |
| `src/components/onboarding/Orientation.tsx` | 네 단계 인터랙티브 오리엔테이션 |
| `src/lib/client/auth-routing.ts` | 공통 온보딩·재보기 라우팅 규칙 |
| `src/lib/client/explanation-recovery.ts` | 끊긴 설명 요청의 저장·응답 상태 판별 |
| `src/lib/client/teaching-progress.ts` | 서버 숙련도와 현재 목표 진행 연결 |
| `src/lib/client/__tests__/auth-routing.test.ts` | 신규·기존·재보기 경로 검증 |
| `src/lib/client/__tests__/explanation-recovery.test.ts` | 응답 복구·중복 설명 구분 검증 |
| `src/lib/client/__tests__/teaching-progress.test.ts` | 새 브라우저의 완료 목표·KU 진행 복원 |
| `src/lib/llm/mastery.ts` | 캐릭터별 반복 설명·기억 갱신 |
| `src/lib/llm/teaching-choices.ts` | 원문 기반 선택지·목표 연결·미학습 설명 판별 |
| `src/lib/llm/__tests__/teaching.test.ts` | 캐릭터별 학습·잘못된 선택·미학습·호칭 회귀 검증 |
| `src/lib/server/__tests__/onboarding.test.ts` | DB 업그레이드·계정 격리·완료 상태 유지 검증 |

## 검증 결과

별도 SQLite DB와 stub LLM으로 최종 운영 빌드를 실행해 검증했습니다. 실제 개발 DB는 백업 후 비파괴 업그레이드만 적용했습니다.

| 검증 | 현재 결과 | 확인 범위 |
| --- | --- | --- |
| 통합 자동 테스트 | **86/86 통과**, 건너뜀 없음 | 기존 LLM·API·저장 검증, 새 인증·온보딩·학습·복구 회귀 테스트 |
| 운영 빌드의 API 스모크 | **253/253 통과** | 기존 인증·자료·세션·시험·LIFE·GAME OVER·졸업·노트 API 계약과 흐름 |
| 온보딩·마이페이지 브라우저 | **6/6 시나리오 통과** | 신규·기존 진입, 완료·재로그인·재보기, 기존 데이터 허브·개별 조회/로그아웃 오류 복구, 320px·390px·데스크톱 화면 |
| 캐릭터별 학습 브라우저 | **5/5 시나리오 통과**, 브라우저 예외 0 | 선택·직접 설명·시험·새로고침, 저장 후 SSE 절단 복구와 다음 설명 전송, 여학생 기억, KU 재설명·중복 노출 방지 |
| TypeScript `pnpm typecheck` | **통과** | 추가 계약과 UI·서버 타입 |
| ESLint `pnpm lint` | **오류 0, 기존 경고 1** | 기존 `layout.tsx`의 외부 글꼴 경고만 남음 |
| 운영 빌드 `pnpm build` | **통과** | Next.js 운영 빌드·라우트 생성 |
| 기존 개발 DB 업그레이드 | **통과** | 백업 후 nullable 컬럼 2개 추가, 기존 18개 테이블의 행 수 유지, 기존 계정 완료 상태 확인 |

새 회귀 테스트는 잘못 가르친 선택의 시험 반영, 모르겠다는 선택의 미학습 처리, 선택지·숙련도 저장, 목표 이름 중첩, 기존 세션 보강, KU의 동일 설명 중복 방지, 호칭 보정 중 사용자 인용 보존, 완료 상태의 계정 격리와 재로그인 유지, 스트림 중단 후 중복 POST 방지를 확인합니다. live LLM 경로의 단위 테스트는 주입한 제공자 응답과 스키마를 사용합니다.

실제 외부 LLM 호출과 Google OAuth 제공자 로그인은 이번 검증에서 실행하지 않았습니다. OAuth 이후 적용되는 공통 인증·온보딩 분기는 테스트했습니다. 빌드에는 기존 `run-life.ts`의 Prisma 재수출 경고도 남지만, 운영 번들의 LIFE 정상·오류 응답을 포함한 API 스모크 검사는 통과했습니다.

클라우드 검증 로그와 브라우저 실행 스크립트는 `/workspace/kurend-onboarding/`에 보관했습니다. 최종 로그는 `ux-build.log`, `ux-typecheck.log`, `ux-lint.log`, `ux-production-smoke.log`, `ux-production-browser.log`이며, 통합 테스트 로그는 `/tmp/kurend-combined-tests.log`입니다.
