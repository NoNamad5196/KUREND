# KUREND 프론트엔드 디자인 리뉴얼

기존 학습 흐름 위에 큰 타이포그래피, 여백, 얇은 구분선과 캐릭터 일러스트를 중심으로 한 editorial 디자인을 적용했습니다. 기능·API·데이터 구조를 새로 만들지 않고 기존 컴포넌트의 스타일과 화면 배치를 변경했습니다.

## 1. 디자인 시스템

| 항목 | 적용 내용 |
| --- | --- |
| 색상 | 따뜻한 배경 `#F7F5EF`, 차콜 `#20261F`, 딥그린 `#244638`, 라임 `#D9ED92` |
| 타이포그래피 | 기존 Pretendard 유지. 큰 제목·작은 모노스페이스 메타데이터 대비, 화면 폭에 따른 `clamp()` 크기 조절 |
| 형태 | 기본 반경 4px, 버튼·입력 3px, 일반 카드 그림자 제거, 얇은 선과 배경색으로 영역 구분 |
| 레이아웃 | 비대칭 히어로, 캐릭터 포스터, 자료·노트 아카이브, 집중형 대화·답안 영역 |
| 모션 | 짧은 등장, 버튼·화살표 이동, 캐릭터 hover 반응. `prefers-reduced-motion` 지원 |
| 캐릭터 | 기존 이미지 원본 유지. 크기·배치·배경·모션만 조정 |

## 2. 공통 컴포넌트

기존 `Card`, `Button`, `Chip`, `PageHeader`, `EmptyState`, `Stepper`, 입력·모달을 그대로 사용하고 공통 토큰과 스타일을 맞췄습니다. shell/session 양쪽 UI의 기존 props와 이벤트 계약을 유지했습니다.

큰 고정 사이드바는 상단 내비게이션으로 바꿨습니다. 모바일에는 같은 목적지를 제공하는 펼침 메뉴, 현재 위치 표시, 키보드 포커스, Escape·배경 클릭 닫기를 적용했습니다. 학습 목표·들은 개념은 대화 하단에서 펼쳐 볼 수 있게 배치했습니다.

## 3. 변경한 화면

- **홈·후배 선택:** 큰 한국어 헤드라인과 현재 후배 스포트라이트, LIFE·진행률·이어하기, 자료 아카이브. 세 후배는 기존 이미지와 메타데이터를 사용하는 서로 다른 포스터 구성입니다.
- **로그인·온보딩:** 브랜드·캐릭터 중심의 Google 전용 로그인과 4단계 안내. 자동 온보딩은 첫 가입 직후, 수동 다시 보기는 마이페이지에서 제공합니다.
- **자료·목록:** 업로드 폼 옆 캐릭터, 열린 목차 목록, 세션·지식 지도에 공통 제목과 구분선을 적용했습니다.
- **가르치기·시험:** 캐릭터와 대화하는 장면, 한 열의 대화와 선택지·입력창, 읽기 쉬운 시험지·결과·복습 화면으로 정리했습니다.
- **마이페이지·기록:** 오답노트·선배의 학습노트를 번호가 있는 컬렉션으로 표현하고, 졸업앨범은 큰 캐릭터가 있는 비대칭 갤러리로 바꿨습니다.
- **상태 화면:** 기존 로딩·오류·빈 상태·시험 결과 오버레이·졸업 요약을 같은 시각 언어로 정리했습니다.

### 이번 작업의 파일 목록

최초 리뉴얼에서는 작업 시작 시 SHA-256 스냅샷 기준으로 **기존 44개 수정·CSS 3개 추가**였습니다. 이후 잔여 스타일 점검까지 포함한 디자인 롤백 대상은 **기존 52개 파일·신규 6개 파일**입니다(신규는 CSS 3개·오류/404 페이지 2개·이 문서). 이전 UX 작업의 미커밋 파일을 이번 변경 수에 포함하지 않았습니다. 아래는 최초 리뉴얼 목록이며 후속 변경은 문서 하단에 기록했습니다.

**디자인 토큰·공통 UI·내비게이션**

- `src/app/globals.css`
- `src/components/shell/AppShell.tsx`
- `src/components/shell/ui.tsx`
- `src/components/session/ui.tsx`
- `src/components/game/CharacterBadge.tsx`
- `src/components/game/game.css`
- `src/components/game/junior.css`

**홈·캐릭터 선택**

- `src/app/page.tsx`
- `src/components/game/JuniorCard.tsx`
- `src/components/game/JuniorSelect.tsx`
- `src/components/game/editorial.css` — 신규

**로그인·온보딩**

- `src/components/auth/LoginScreen.tsx`
- `src/components/auth/login.css`
- `src/components/onboarding/Orientation.tsx`
- `src/components/onboarding/orientation.css` — 신규

**자료·세션 목록·지식 지도**

- `src/app/new/page.tsx`
- `src/app/materials/[id]/page.tsx`
- `src/app/sessions/page.tsx`
- `src/app/map/page.tsx`

**준비·가르치기**

- `src/components/session/ObjectivesPanel.tsx`
- `src/components/session/SpeechBubble.tsx`
- `src/components/session/StepperHeader.tsx`
- `src/components/session/session.css`
- `src/components/session/prepare/PreparePage.tsx`
- `src/components/session/teach/TeachPage.tsx`
- `src/components/session/teach/ChatThread.tsx`
- `src/components/session/teach/Composer.tsx`

**시험·결과·복습·완료**

- `src/components/exam/AnswerSheet.tsx`
- `src/components/exam/Choices.tsx`
- `src/components/exam/RecallPanel.tsx`
- `src/components/exam/ReportCard.tsx`
- `src/components/exam/ViewSettings.tsx`
- `src/components/exam/pages/ExamPage.tsx`
- `src/components/exam/pages/ResultPage.tsx`
- `src/components/exam/pages/ReviewPage.tsx`
- `src/components/exam/pages/CompletePage.tsx`
- `src/components/exam/pages/shared.tsx`

**마이페이지·오답노트**

- `src/components/mypage/MyPage.tsx`
- `src/components/mypage/TeacherNoteCollection.tsx`
- `src/components/mypage/WrongNotesHub.tsx`
- `src/components/mypage/archive.css` — 신규
- `src/components/wrong-notes/WrongNoteList.tsx`
- `src/components/wrong-notes/WrongNoteDetail.tsx`
- `src/components/wrong-notes/wrong-notes.css`

**졸업앨범·졸업 요약**

- `src/components/album/AlbumPage.tsx`
- `src/components/album/album.css`
- `src/components/game/GraduationSummary.tsx`

문서: `docs/design-renewal.md` 신규 작성.

## 4. 로직 변경 여부

최초 디자인 작업에서는 로그인·온보딩과 자료 업로드·분석, Run 생성, SSE 채팅, LLM 호출, 선택형·서술형 분기, 채점, LIFE, 오답·학습노트, 게임오버·졸업의 업무 로직을 유지했습니다. 이후 사용자 요청에 따른 체험 인증 종료와 온보딩 진입 조건 변경은 아래에 별도로 기록했습니다. 학습·채점·LIFE·졸업 동작은 유지합니다.

최초 디자인 리뉴얼 검증 당시 API, `src/lib`, contracts, Prisma, scripts, public 자산, `package.json`, lockfile **183개 파일의 해시가 동일**했습니다. 후속 인증 흐름 수정과 개인정보 HTML 스타일 변경은 이 최초 집계 이후의 별도 변경입니다. 새 DB 모델·persona prompt·캐릭터 설정·의존성·디자인 프레임워크는 추가하지 않았습니다.

## 5. 반응형·검증

데스크톱의 분할 레이아웃은 태블릿·모바일에서 한 열로 전환합니다. 제목 크기와 캐릭터 위치를 조절하고, 학습 화면은 작은 폭에서 상단 캐릭터 영역을 줄여 대화·입력에 먼저 접근하도록 했습니다. 버튼은 충분한 터치 영역을 유지하며 긴 제목·한국어·노트 내용도 줄바꿈하도록 처리했습니다.

| 검사 | 상태 |
| --- | --- |
| 홈·후배 선택 | 1440/768/390/320px, 8회 레이아웃 검사 통과. 선택 버튼·키보드 focus 확인 |
| 로그인·온보딩 | 20개 화면·폭 조합 검사 통과 |
| 마이페이지·기록 화면 | 10개 화면·폭 조합 검사 통과 |
| 학습·준비 | 각 4개 폭 검사 통과, 모바일 상단 영역 축소 확인 |
| 업로드·자료·세션·지식 지도 | 16개 화면·폭 조합 통과. 모바일 메뉴·Escape·탐색·샘플 입력 확인 |
| 시험·결과·복습·완료 | 6개 상태 × 4개 폭 통과. 보기 설정 팝오버 8개 폭 검사 통과 |
| 전체 ESLint·TypeScript·운영 빌드 | 통과. 기존 외부 폰트 안내 및 Prisma 재노출 빌드 경고는 유지 |
| 운영 빌드 API 회귀 검증 | 격리한 SQLite DB에서 253개 통과, 실패 0개 |
| 운영 빌드 실제 브라우저 기능 검증 | 신규 로그인·온보딩·다시 보기·로그아웃 오류 복구·노트 재시도·세 후배 학습·SSE 복구 등 11개 시나리오 통과. 브라우저 예외 0개 |

화면 검증 집계는 화면·상태·뷰포트 조합 기준이며, 독립적인 업무 로직 테스트 수를 뜻하지 않습니다. API·브라우저 기능 검증은 별도로 실행했습니다. 테스트 데이터는 임시 DB에만 만들었습니다.

### 디자인 검토와 되돌리기

별도 미리보기 `/workspace/kurend-design-review/preview/index.html`에서 홈·후배 선택·학습·시험·마이페이지·로그인·온보딩·개인정보의 데스크톱/모바일 화면을 전환할 수 있습니다. 실제 구현 화면을 캡처한 정적 갤러리입니다.

디자인 변경 직전의 52개 원본을 `/workspace/kurend-design-review/before`에 보관했습니다. `python3 /workspace/kurend-design-review/rollback.py`는 해시를 검증하는 읽기 전용 점검이며, 사용자가 디자인 되돌리기를 요청하면 `--apply`로 52개 화면 파일 복원과 디자인 전용 신규 파일 6개 제거를 실행할 수 있습니다. 후속 요청인 Google 전용 로그인과 온보딩 진입 제한은 별도 복원본으로 보존합니다. 이전 UX·학습 개선 작업과 DB는 유지하며, 이후 편집이 감지되면 자동 복원은 중단합니다.

## 6. 의도적으로 유지한 자산과 개발 화면

- `public/privacy.html`은 로그인 없이 열 수 있는 독립 문서이며, 최종 점검에서 앱과 같은 배경·글꼴·색상·구분선으로 교체했습니다. 정책 조항과 연락처는 유지했습니다.
- `/dev/game`은 개발용 컴포넌트 가이드입니다. 운영 빌드에서는 404이며 사용자 메뉴에 노출되지 않습니다.
- 게임오버·졸업의 캠퍼스 배경과 캐릭터 이동 연출은 기존 경험을 보존했습니다. 주변 글자·버튼·오버레이는 정리했지만 일반 학습 화면보다 장면성이 강한 것은 의도입니다.

## 후속 반영: Google 로그인 전환 (2026-10-02)

위 디자인 리뉴얼 이후 사용자 요청에 따라 로그인 화면의 준비 중 표시·체험 계정 선택·상태 확인 요청을 제거했습니다. Google OAuth 진입 링크와 로그인 오류 안내, 최초 이용 온보딩은 유지합니다. 소개 문구도 설명하며 배우는 공부에 맞췄습니다.

운영 환경의 실제·모의 체험 인증 API는 404로 닫았습니다. 개발·테스트에서는 시드 계정 3개만 허용합니다. 기존 DB는 보존하며 Render 상태 점검은 별도 `/api/health`에서 확인합니다. 이 후속 변경은 위 디자인 작업의 백엔드 해시 보존 집계와 별개의 변경입니다.

추후 디자인 롤백에도 Google 전용 로그인은 유지하도록 별도 로그인 화면 복원본을 적용합니다. 디자인 변경 직전의 원본 보관 파일은 그대로 남겨 두었습니다.

관련 회귀 테스트 8개, ESLint·타입 검사를 포함한 운영 빌드, 운영 HTTP 체험 경로 차단과 DB 상태 점검을 통과했습니다. 로그인은 1440/768/390/320px 배치·Google 진입 링크·콜백 오류 4종·불필요한 요청 제거를 실제 브라우저로 확인했습니다. 로컬 환경에는 Google OAuth 키가 없어 실제 계정 인증 완료는 수행하지 않았으며, 기존 OAuth 설정과 콜백 구현은 변경하지 않았습니다.

## 후속 반영: 온보딩 진입 제한 (2026-10-02)

자동 온보딩은 Google 계정을 처음 생성한 직후에만 엽니다. 기존 계정은 온보딩을 끝내지 않았어도 홈으로 이동하며, 일반 탐색·재로그인·새로고침에서 다시 온보딩으로 보내지 않습니다. 홈의 중복 안내와 다시 보기 링크를 제거하고, 마이페이지의 ‘서비스 이용 방법 다시 보기’만 남겼습니다. 다시 보기의 끝과 돌아가기 링크는 마이페이지로 연결하며 완료 기록을 변경하지 않습니다.

`/onboarding?mode=signup`은 최초 가입 진입, `?mode=replay`는 다시 보기 진입입니다. 모드 없는 `/onboarding`은 홈으로 이동합니다. 이 변경은 기존 DB·학습 기록을 유지하며, 디자인 롤백에도 진입 조건이 보존됩니다.

라우팅 조건 테스트 3개와 임시 DB·Google 응답 모의 처리를 사용하는 콜백 회귀 테스트 8개를 통과했습니다. 운영 빌드에서 완료·미완료 계정 × 일반 페이지 7개, 직접 URL 진입, 마이페이지 다시 보기·복귀, 가입 안내 중도 이탈, 완료 저장 실패·재시도를 브라우저로 검증했습니다. 예상치 못한 온보딩 진입과 브라우저 예외는 0개입니다.

## 후속 반영: 남은 화면 스타일 점검 (2026-10-02)

주요 화면 외에도 개인정보 문서, 삭제 확인창·알림, 업로드 파일·오류 표시, 자료 처리 상태, 원문 드로어, 선배의 학습노트, KU 상태 효과를 점검했습니다. 남아 있던 큰 모서리·그림자·개별 카드·예전 색상을 새 토큰과 구분선으로 맞췄습니다. 무한 축하 점프·컨페티를 짧은 피드백으로 줄이고, 쓰이지 않는 홈 시작 가이드·회전 칩·광선·카드 CSS를 제거했습니다. 404 및 예기치 않은 화면 오류에도 새 디자인을 적용했습니다.

기존 8개 추가 변경: `public/privacy.html`, `src/app/layout.tsx`, `src/app/runs/[id]/graduation/page.tsx`, `src/components/session/SourceDrawer.tsx`, `src/components/game/TeacherNoteDrawer.tsx`, `src/components/game/ResultOverlay.tsx`, `src/components/game/scenes/GraduationScene.tsx`, `src/components/mascot/mascot.css`. 새 파일은 `src/app/not-found.tsx`와 `src/app/error.tsx`입니다. 기존 수정 파일인 공통 UI·토큰·업로드·자료·게임·세션 스타일도 정리했습니다.

운영 빌드의 ESLint·타입 검사를 통과했습니다. 개인정보 7개 조항, 파일 선택·오류, 확인창 취소, 학습노트 펼침, 원문 강조·Escape 닫기, KU 축하·동작 줄이기, 404·운영 개발 페이지 제외를 데스크톱/모바일 브라우저로 확인했습니다. 실제 데이터 변경과 브라우저 예외는 없었습니다. 이는 현재 작업본 기준이며 외부 서비스 배포를 실행한 기록은 아닙니다.

졸업·게임오버도 운영 빌드에서 실제 기록을 변경하지 않는 모의 응답으로 확인했습니다. 새 컨페티 색상, 모바일 CTA 접근, 동작 줄이기, 화면 고정 위치가 통과했습니다. 캐릭터 원본·캠퍼스·트럭 아트와 게임 진행 시간은 보존했습니다.

## main 통합 후 롤백 참고

원격 `fea5960`까지의 학습 복구·후배 변경·졸업시험·자료 화면 분리 수정과 통합했습니다. 최초 리뉴얼 원본과 병합 전 체크포인트 `5c6b99e`는 보존했습니다. 위 디자인 전용 자동 복원 스크립트는 후속 편집을 감지해 실행을 중단하는 것이 정상입니다. 통합 이후에는 원격 기능을 함께 지우지 않도록 디자인 차이만 검토해 되돌려야 하며, 이전 스냅샷을 그대로 덮어쓰면 안 됩니다.

### 통합본 검증

- 잠금 파일 기준 의존성 설치와 Prisma 생성, TypeScript, 운영 빌드(ESLint 포함) 통과. 기존 외부 폰트 안내 경고는 남아 있습니다.
- LLM 회귀 79개, 인증 회귀 23개, 클라이언트·후배 변경 테스트 파일 5개 통과.
- 운영 HTTP에서 서명 쿠키 인증, 위조·서명 없는 쿠키 401, 개발 API 404, DB health 200 확인. 기존 운영 사용자는 Google 재로그인이 한 번 필요합니다.
- 완료·미완료 계정의 일반 탐색과 MyPage replay, 가입 안내 이탈·완료 저장 재시도 검증. 자동 온보딩 재진입과 브라우저 예외 없음.
- 주요 화면·개인정보·드로어·완료·404 및 졸업/게임오버를 데스크톱·모바일에서 확인.
- 임시 DB와 stub LLM으로 남학생·여학생·KU 각각 실제 업로드/목차 생성/준비/설명 SSE/저장 복원/시험 진입을 검증. 3·5·7문항 및 선택 캐릭터 유지 확인. 원본 DB는 변경하지 않았습니다.

실제 Google 계정 인증과 외부 서비스 배포 완료는 이 로컬 검증에 포함되지 않습니다. 화면별 모션 후속 작업 지시안은 `docs/motion-renewal-prompt.md`이며, 문서 작성만으로 해당 모션을 구현한 것은 아닙니다.
