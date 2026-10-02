# KUREND 정적 자산 교체

초기 구현은 새 프론트 `dbf3839`를 기준으로 했고, main 반영 전 `bd48bd9`까지의 공부하기·음성 입력·업적·새 앱 셸 및 모바일 홈 배치 변경을 보존해 통합했다. 출처는 사용자가 첨부한 `KUREND_rigging_1_신규01-20.zip` 및 `KUREND_rigging_2_참고자료.zip`이다. Notion에서 새로 가져온 자료로 표시하지 않는다.

## 원본 대응표

01–16은 한 파일에 한 캐릭터·한 자세가 들어간 완성 PNG다. 삼면도는 참고용으로만 보관한다. 01–20의 실제 알파 투명도를 확인했으며, 원본 21개의 치수와 SHA-256을 `public/assets/kurend/manifests/sources.json`에 보관한다. 원본 픽셀은 변경하지 않는다.

| 번호 | 첨부 원본 | 실제 파일 경로 |
| --- | --- | --- |
| 1 | 01_남학생_기본복장_정면.png | `/assets/kurend/characters/male/source/default-front.png` |
| 2 | 02_남학생_군복방탄모_정면.png | `/assets/kurend/characters/male/source/military-front.png` |
| 3 | 03_남학생_졸업복_정면.png | `/assets/kurend/characters/male/source/graduation-front.png` |
| 4 | 04_여학생_기본과잠_정면.png | `/assets/kurend/characters/female/source/default-front.png` |
| 5 | 05_여학생_베이지스웨터청바지_정면.png | `/assets/kurend/characters/female/source/casual-front.png` |
| 6 | 06_여학생_졸업복_정면.png | `/assets/kurend/characters/female/source/graduation-front.png` |
| 7 | 07_남학생_기본복장_측면.png | `/assets/kurend/characters/male/source/default-side.png` |
| 8 | 08_남학생_군복방탄모_측면.png | `/assets/kurend/characters/male/source/military-side.png` |
| 9 | 09_남학생_졸업복_측면.png | `/assets/kurend/characters/male/source/graduation-side.png` |
| 10 | 10_여학생_기본과잠_측면.png | `/assets/kurend/characters/female/source/default-side.png` |
| 11 | 11_여학생_베이지스웨터청바지_측면.png | `/assets/kurend/characters/female/source/casual-side.png` |
| 12 | 12_여학생_졸업복_측면.png | `/assets/kurend/characters/female/source/graduation-side.png` |
| 13 | 13_KU_기본_정면.png | `/assets/kurend/characters/ku/source/default-front.png` |
| 14 | 14_KU_졸업복_정면.png | `/assets/kurend/characters/ku/source/graduation-front.png` |
| 15 | 15_KU_기본_측면.png | `/assets/kurend/characters/ku/source/default-side.png` |
| 16 | 16_KU_졸업복_측면.png | `/assets/kurend/characters/ku/source/graduation-side.png` |
| 17 | 17_KU_GAMEOVER_일반트럭_측면.png | `/assets/kurend/vehicles/ku-truck/source.png` |
| 18 | 18_남학생_GAMEOVER_군용트럭_측면.png | `/assets/kurend/vehicles/military-truck/source.png` |
| 19 | 19_공용_학사모.png | `/assets/kurend/props/graduation-cap/source.png` |
| 20 | 20_공용_졸업장.png | `/assets/kurend/props/diploma/source.png` |
| 별도 | bg_캠퍼스배경.png | `/assets/kurend/backgrounds/campus/source.png` |

## 화면별 적용

| 용도 | 캐릭터·차량 | 배경 |
| --- | --- | --- |
| 로그인·홈·선택·온보딩 | 해당 후배의 기본 정면 PNG | 로그인·선택은 기존 종이/색면, 홈 그림 영역에 별도 캠퍼스 PNG |
| 준비·가르치기·시험·결과·완료 | 세션에서 선택된 후배 기본 정면, 조회 중에는 중립 placeholder | 읽기 쉬운 기존 종이 배경; 복잡한 삽화 추가 없음 |
| 앨범·기록 | 기존 기록에 맞는 후배·의상, 정지 | 기존 정적인 카드 배경 |
| 남학생 GAME OVER | 군복 측면 + 18 군용 트럭 | 별도 캠퍼스 PNG |
| KU GAME OVER | KU 기본 측면 + 17 일반 트럭 | 별도 캠퍼스 PNG |
| 여학생 GAME OVER | 사복 측면, 차량 없음 | 별도 캠퍼스 PNG + 정적인 저녁 색상 |
| 졸업 | 각 후배의 졸업복 정면 PNG, 원본의 의상·학사모 유지 | 별도 캠퍼스 PNG |

제공된 독립 배경은 캠퍼스 한 종류다. 홈·졸업·게임오버 용도를 구분해 크기와 배치를 조정하며, 없는 전용 배경 파일을 있다고 가정하지 않는다. 새 후면 원본은 없으므로 기존 `back` 호출은 같은 후배·의상의 측면으로 대응한다. 별도 표정 이미지도 없으므로 상태에 따라 원화의 얼굴을 변형하지 않는다.

`JuniorAvatar`, `JuniorOrMascot`, `Mascot`의 호출 계약은 유지하며 공통 정적 PNG 렌더러로 연결한다. 표시 영역은 실제 알파 윤곽에 여백을 더한 CSS 표시 영역으로 정규화하고 비율을 유지한다. 캐릭터·차량의 발/바퀴 바닥을 같은 행에 배치한다. 배경, 캐릭터, 말풍선, 버튼은 각각 별도 DOM 요소다.

캐릭터의 점프·호흡·회전·흔들림·이동·반복 축하, 차량 이동·바퀴 회전·매연, 졸업 모자 반복 타이머를 제거한다. 종료 장면에는 원래 이야기와 안내, 다음 버튼을 처음부터 표시한다. 학습 요청·텍스트 스트리밍·상태 안내·선택 테두리·키보드 포커스는 기존 기능을 유지한다.

## 엔딩 연출 추가 (2026-10-02)

졸업·게임오버에는 원본 PNG 전체를 작은 각도로 기울이며 이동하는 종이인형 스톱모션을 추가했다. `PaperEnding`과 `paper-ending.css`가 엔딩에서만 연출을 담당하며, 공통 `StaticCharacter`와 원본 이미지는 그대로다. 졸업은 3초, 남학생 퇴장은 3.5초, 여학생 퇴장은 3초, KU 트럭 출발은 4초 뒤 정지한다.

이미지 디코딩 후 재생하며, 기록·다음 버튼은 기다리지 않고 사용할 수 있다. 건너뛰기와 다시 보기를 제공한다. OS 또는 앱의 움직임 줄이기 설정에서는 정적인 구도를 보여주고, 화면 이탈 시 타이머와 구독을 정리한다. 졸업 처리·게임오버 판정·API·DB는 변경하지 않는다.

개발 환경의 `/dev/game`에서 세 캐릭터의 두 엔딩을 확인할 수 있다. 데스크톱·모바일 12개 조합, 프레임 사이 자세 유지, 버튼 위치 고정, 수평 넘침 방지, 건너뛰기·다시 보기·즉시 다음 이동, OS·앱 움직임 줄이기를 Chromium에서 검증했다. 해당 개발 페이지는 운영에서 계속 404다.

## 보존과 복구

기존 `public/characters/`와 이전 SVG 정의 파일은 비교·복구용으로 보관한다. 현재 화면의 경로는 신규 자산으로 전환한다. 이전 미커밋 리깅 작업 전체는 `work` 브랜치 기준 git stash로 보존했다.

- 이전 리깅 작업 stash: `8b2343003bf07886a776ea03bb4987ebbdaa8e4f`
- 이번 정적 교체 작업 브랜치: `static-assets`
- 추가 원본 사본: `/workspace/kurend-static-backup/provided-assets`

새 작업을 먼저 별도로 보존한 뒤 이전 `work` 상태에서 해당 stash를 적용하면 리깅 작업을 복원할 수 있다. 새 프론트에 이전 stash를 그대로 덮어쓰지 않는다. 정적 교체는 별도 커밋으로 관리해 이 변경만 되돌릴 수 있다.

## 검증

원본/알파/밝은·어두운 배경 검사 자료와 실제 브라우저 화면은 `/workspace/kurend-static-backup/visual-qa` 및 `/workspace/static-validation`에 보관한다. 개발용 `/dev/assets`는 분리 원본, `/dev/game`은 실제 컴포넌트에 fixture를 전달한 정적 시연이며 production에서는 표시하지 않는다. 최종 실행 결과는 아래와 같다.


### 정적 교체 검증 결과 (2026-10-02 KST)

- 원본 21개: 업로드 ZIP과 SHA-256·크기 일치. 01–20 실제 RGBA 알파 확인, 배경은 RGB. 밝은/어두운 바탕과 일반 표시 크기에서 체크무늬·큰 배경 잔상·잘림 없음.
- 정적 캐릭터 16조합: 정상 로드, 비율 유지, 발 기준선 일치, 캐릭터 SVG/FX·활성 애니메이션 없음.
- 실제 페이지/컴포넌트에 검증용 데이터를 넣은 화면 57개(1440/390/320px) 및 홈 수정 후 6개 재캡처: 가로 넘침·자산 실패·JS 예외 없음. 로그인·홈·선택·가르치기·온보딩·앨범·분리 자산·종료 장면 포함.
- 세션 후배 조회 지연/연습 모드 16개: 시험·결과·완료에서 잘못된 KU 선표시 없음, 선택한 세 캐릭터를 유지. 연습 모드의 기존 학습 규칙은 변경하지 않음.
- 별도 종료 장면 18개: 3캐릭터 × GAME OVER/졸업 × 320/390/1440px. 버튼/요약 즉시 표시, 키보드 이동, 차량 선택, 1초 뒤 위치 불변, 컴포넌트 timer/RAF 0건. 차량·캐릭터 표시 영역 바닥 차이 0px. 초기 졸업 중앙 정렬 문제를 수정하고 재검사함.
- 결과 및 선택 카드 8개: LIFE 최종 서버값/버튼 즉시 표시, onClose/onGameOver 유지, 320×568px 결과 내부 스크롤, hover 시 캐릭터 정지.
- 기존 인증·온보딩·설명 복구·SSE·숙련도 클라이언트 검사 35/35 통과. Google provider는 mock 기반 계약 검사이며 실제 Google 계정의 외부 OAuth 인증을 수행한 것은 아님.
- 타입 검사·ESLint·production 빌드 통과. 기존 layout 폰트 경고 1개는 유지.
- Production 실제 API/브라우저: 서명 인증 및 unsigned 거부, 데모 인증 차단, 실제 홈 API 200, 원본 21개 요청 200, 320/390/768/1440px 실제 홈 렌더링, 로그인 새 캐릭터 3종, 개발 미리보기 차단 확인. 최종 JS 예외·신규 자산 오류 0건.

최신 main으로 전환하면서 이전 로컬 DB에 Session.character/replacementSessionId 등 새 컬럼이 없어 초기 /api/home 요청이 500이었다. DB를 SQLite backup으로 보존한 뒤 저장소의 기존 scripts/render-db.mjs를 실행해 추가 스키마를 반영했다. 18개 기존 테이블의 row 수와 기존 컬럼 값을 모두 유지했고 실제 /api/home·/api/runs/current가 200으로 복구됐다. 서버/API/Prisma 스키마 소스는 이 정적 교체 작업에서 수정하지 않았다. 초기 기록의 500은 해결 전 환경 기록이며 최종 production 결과와 구분한다.

일반 표시 크기에서 눈에 띄는 배경 잔상은 발견하지 못했다. 제공 원본의 미세한 반투명 윤곽까지 모든 확대 배율에서 무결점이라고 판정한 것은 아니다. 실제 API 홈 미리보기와 fixture 기반 종료 장면은 결과물에서 구분한다. 이 기록은 코드와 로컬 실행 검증이며 외부 서비스의 배포 완료를 의미하지 않는다.


### 최신 main 통합 후 재검증 (2026-10-02 KST)

`a5e32b5`까지의 공부하기·음성 입력·업적·오늘 할 일·후배 헤더와 후속 수업 기능을 보존해 정적 교체를 통합했다. 새 후배 헤더 때문에 320px에서 메뉴가 화면 밖으로 밀리는 문제를 발견해, 380px 이하에서 후배 정보를 다음 줄로 배치했다. 메뉴·프로필·후배·LIFE 정보는 모두 유지한다.

통합 후 기존 인증·온보딩·SSE·설명 복구 및 최신 가르치기 선택지 검사 37/37, production 빌드(타입·린트 포함), 실제 production API·브라우저 검사 12개를 통과했다. 320/390/768/1440px 홈, 320px 메뉴 Enter/Escape, 신규 원본 21개 HTTP 200, 서명 인증 및 unsigned 거부, 개발 미리보기 차단을 다시 확인했다. 자산 오류·페이지 예외·가로 넘침은 없었으며 기존 layout 폰트 경고 1개는 남아 있다.

최종 통합에는 `bd48bd9`의 모바일 후배 카드 우선 배치도 포함한다. 이 상태에서 production 빌드와 API·브라우저 검사 12개를 다시 통과했다.
