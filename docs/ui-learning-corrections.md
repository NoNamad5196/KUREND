# 캐릭터 배치 및 학습 근거 수정 보고

## 적용 범위와 보존 사항

2026-10-02 요청 기준. 기존 정적 PNG, 내부 캐릭터 ID, API 주소, Prisma 스키마, 로그인·온보딩 조건·세션 복구·학습 단계·합격선·LIFE 규칙을 유지한다. 이미지 재생성, 새 의존성, DB 마이그레이션은 없다.

새 챕터의 학습 목표와 시험은 요청한 5개 기준을 적용한다. 컴돌이는 객관식, 컴순이와 KU는 서술형이다. 병합 시 사용자의 명시적인 선택에 따라 졸업시험은 혼합 10문항을 유지한다. 캐릭터별 숙련 속도와 합격선은 유지한다. KU의 확인 질문은 기존 난이도에 따라 반복될 수 있다. 이미 만들어진 3·7·10문항 시험은 재생성하지 않으며, 이어하기 화면에도 저장된 문항 수를 표시한다.

## 1–3. 메인·온보딩·졸업복 배치

`JuniorTrio`를 홈의 환영 카드, 로그인, 온보딩 첫 화면과 마지막 화면에서 공유한다. DOM과 화면 순서는 컴돌이 / KU / 컴순이다. 기존 PNG 메타데이터의 실제 알파 영역을 기준으로 좌우 여백을 계산하고, KU는 50%, 좌우 캐릭터는 대칭 위치에 놓아 실루엣 중심 사이의 거리를 동일하게 맞춘다. 화면별 기존 캐릭터 높이와 원본 비율을 유지한다.

온보딩 마지막 화면은 세 명 모두 각자의 `graduation-front.png`를 사용한다. 작은 화면에서 기존 크기를 유지하면 팔 일부가 겹치므로 KU를 앞에 배치해 얼굴이 가려지지 않게 했다. 새 이미지를 만들거나 자르지 않는다.

주요 파일: `src/components/game/JuniorTrio.tsx`, `junior-trio.css`, `src/app/page.tsx`, `src/components/auth/LoginScreen.tsx`, `login.css`, `src/components/onboarding/Orientation.tsx`, `orientation.css`, `src/components/game/editorial.css`.

## 4. 표시명

표시명은 컴돌이·컴순이·KU로 통일했다. `CHARACTERS`, `CHARACTER_META`, `juniorLabel`, 아바타 접근성 라벨, 홈 안내, 업적, LLM 프롬프트, 개발 갤러리와 점검 스크립트를 포함한다. 내부 `MALE_EASY`·`FEMALE_NORMAL`·`KU_HARD`는 유지한다. 과거 문서와 업로드 원본 파일명 기록은 출처 보존을 위해 변경하지 않았다. 기존 사용자가 작성한 학습 기록도 개명 목적으로 수정하지 않는다.

결과 화면과 온보딩의 고정 대사도 컴돌이의 존댓말·컴순이의 해요체를 적용했으며 KU 대사는 유지한다.

## 5. 컴돌이 객관식 품질

`teaching-choices.ts`에서 원문에서 추출한 개념 문장을 정답으로 고정하고, 별도 출제 프롬프트가 같은 개념의 오개념 세 가지를 생성한다. 정답 표시나 캐릭터 말투는 생성 입력에 넣지 않는다. 중복, 다른 주제, 메타 부정, 모르겠다는 보기, 길이 편차를 검증한다. 시험 객관식에도 메타 보기·중복·길이 검사를 적용한다.

오프라인 stub은 원문에서 조건·관계·역할을 바꾼 검증 가능한 보기만 사용한다. 학습 선택지를 만들 근거가 부족하면 임의 보기를 꾸미지 않고 기존 직접 설명·재시도 경로를 제공한다. 기존 세션에서 빠진 선택지를 복원할 때도 같은 생성 경로를 사용한다.

주요 파일: `src/lib/llm/teaching-choices.ts`, `prompts/teaching-choices.ts`, `prompts/prepare-session.ts`, `schemas.ts`, `live.ts`, `stub.ts`, `provider.ts`, `routes/handlers.ts`.

## 6–9. 잘못 가르친 내용의 저장과 시험 반영

사용자 설명은 기존 설명 API에서 `Message`의 USER/ANSWER 내용으로 먼저 저장된다. 실패 후 재시도할 때 같은 메시지를 재사용하는 기존 흐름을 보존한다. 컴돌이·컴순이는 원문과 다르다는 이유만으로 즉시 교정하지 않으며, 자연스러운 반응 후 다음 학습 목표를 질문한다. 오류가 감지된 설명의 반응은 정해진 후배 대사로 처리해 정답이나 신뢰 관련 메타 발언이 새어 나오지 않게 한다.

시험 답안 입력은 `question`, 저장된 `taught`, `heardConcepts`, 필요한 경우 `choices`만 허용한다. 강의 원문·rubric·정답 키·persona를 전달하지 않는다. 출제·학습 대화·답안·채점 프롬프트도 분리했다.

모델이 만든 답안 의역을 그대로 사용하지 않는다. 실제 학습 메시지에 존재하는 인용을 검증한 뒤, 부정절·조건이 잘리지 않도록 같은 문장의 전체 내용을 복원하고 문장 어미만 답안체로 바꾼다. 객관식도 정답 키 대신 학습 인용과 보기만 비교한다. 근거가 모호하면 미학습으로 표시한다. 따라서 ‘입출력 완료를 기다리는 상태’라고 배운 답을 모델이 ‘CPU 할당을 기다리는 상태’로 바꿔도 반영되지 않는다.

자동 보정 차단 위치: `src/lib/llm/live.ts`의 `writeExamAnswer`, `src/lib/llm/exam-grounding.ts`의 `completeTeachingQuote`, `answerFromQuote`, `groundedChoice`. 저장 경로는 `routes/handlers.ts`, `routes/prisma-backend.ts`를 유지한다.

## 10–11. 오답 원인과 표시

원인 값은 `WRONG_KNOWLEDGE`, `INSUFFICIENT_LEARNING`, `CONFUSION`, `UNKNOWN`이다. ‘잘못된 지식을 학습해서 틀렸습니다’는 학습 인용이 실제 저장 내용에 존재하고, 답안이 해당 인용을 따랐으며, 채점에서 자료 모순 또는 객관식 오답을 확인한 경우에만 표시한다. 모델의 원인 제안만으로 잘못 가르쳤다고 단정하지 않는다.

기존 `Gap.conceptsJson` 배열에 원인 메타데이터를 덧붙여 저장한다. 공개 DTO에는 개념 문자열 배열과 선택적 `errorReason`으로 나눠 전달한다. 기존 문자열 배열 기록도 그대로 읽는다. DB 열이나 테이블을 추가하지 않았다.

결과 화면·되짚기·오답노트에서 `LearningErrorFeedback`으로 원인, 학습한 설명, 실제 답안, 자료의 정답 근거를 표시한다. 오답노트의 자기 성찰 입력을 하기 전에도 확인할 수 있고, 기존 성찰·비교·다시 가르치기 기능은 유지한다.

주요 파일: `src/lib/learning/error-reason.ts`, `src/contracts/types.ts`, `src/contracts/game.ts`, `src/lib/llm/prompts/grade-exam.ts`, `src/lib/server/session-dto.ts`, `wrong-note.ts`, `src/components/exam/LearningErrorFeedback.tsx`, `pages/ResultPage.tsx`, `pages/ReviewPage.tsx`, `src/components/wrong-notes/WrongNoteDetail.tsx`.

## 12–13. 메모줄과 말풍선

객관식 답변·이유 영역은 노트 줄 배경에서 분리해 불투명한 패딩 영역에 표시한다. 객관식 카드와 학습 선택지에는 줄바꿈·최소 너비·일관된 안쪽 여백을 적용했다. 서술형 답안의 기존 노트 표현은 유지한다.

실제 꼬리가 있는 결과 말풍선은 중앙 캐릭터와 같은 중심을 사용한다. 공통 `SpeechBubble`은 상·하 꼬리의 상대 위치 `tailAnchor`를 제공한다. 그 외 확인 화면의 대화와 안내는 기존처럼 꼬리가 없는 구성이다.

주요 파일: `src/components/exam/AnswerSheet.tsx`, `Choices.tsx`, `src/components/session/teach/TeachPage.tsx`, `session.css`, `SpeechBubble.tsx`.

## 14–15. 검증 및 한계

검증 수치와 실행 명령은 아래 최종 검증 기록에 정리한다. 브라우저 미리보기의 학습·결과 데이터는 명시적인 fixture이며, 실제 DB 연동 여부는 별도 SQLite 통합 테스트로 확인한다.

실제 외부 LLM API 키가 없는 환경이므로 외부 모델의 실출력 품질은 실호출로 확인하지 않았다. 모델 응답을 주입한 생성·검증·오류 테스트와 실제 API·DB 저장 경로를 검증했다. 객관식의 의미적 오답 품질은 프롬프트 및 구조 검사로 개선했지만, 임의의 모든 강의자료에서 외부 모델의 결과를 보장한다는 의미는 아니다.

변경 사항은 전용 커밋으로 보존하며 해당 커밋을 되돌려 복구할 수 있다. 원본 PNG와 기존 정적 자산 교체 커밋은 그대로 유지된다.

## 최종 검증 기록

아래 수치와 작업공간 경로는 원격 커밋 `6a75877` 작성 당시의 기록이다. 후속 통합 버전의 검증 결과와 운영상 남은 확인 사항은 [학습 흐름 수정 보고](learning-flow-fixes.md)를 참고한다.

- 전체 자동 테스트: **138개 통과, 실패 0, 건너뜀 0**. 앱 DB와 분리한 SQLite에서 순차 실행했다.
- 잘못 가르치기 통합 테스트: 컴돌이·컴순이의 실제 저장, 다음 질문, 시험 답안, 채점, 결과 DTO, 오답노트 재조회, LIFE 1회 처리를 검증했다. 기존 3·7·10문항 복원도 검증했다.
- `pnpm build`: 성공. 타입 검사·ESLint 포함. 기존 `layout.tsx`의 외부 폰트 권고 경고 1건은 남아 있으며 이번 변경과 무관하다.
- 반응형 브라우저: 320·390·768·1440px, 최종 48개 fixture 화면 확인. JS 오류·이미지 실패·가로 넘침·이전 표시명·머리/발 잘림 없음. 수정 후 주요 그룹 20개 장면을 다시 확인했다.
- 캐릭터 실루엣 중심 간격의 좌우 차이 최대 0.043px, KU 중앙 차이 최대 0.013px. 결과 말풍선 꼬리와 캐릭터 중심 차이 최대 0.008px.
- 배포 빌드 실행: 별도 production 서버에서 12개 검사 통과. 실제 로컬 DB의 서명 세션, 평문 인증 거절, 데모 로그인 차단, 홈 4개 너비, 모바일 메뉴 키보드, PNG 21개 응답, 개발 갤러리 비공개를 확인했다.
- `git diff --check` 통과. 실행 코드·Prisma·스크립트에서 이전 표시명 검색 결과 0건. 원본 PNG, Prisma 스키마, 패키지 및 잠금 파일 변경 없음.

재현 명령(저장소 루트, 준비된 별도 테스트 DB 필요):

```sh
export COREPACK_HOME=/workspace/.cache/corepack COREPACK_ENABLE_AUTO_PIN=0 NEXT_TELEMETRY_DISABLED=1
export NODE_PATH="$PWD/node_modules/.pnpm/node_modules${NODE_PATH:+:$NODE_PATH}"
DATABASE_URL=file:/workspace/request-validation/test.db LLM_PROVIDER=stub LLM_STUB_DELAY_MS=0 \
  corepack pnpm@10.30.3 exec tsx --test --test-concurrency=1 \
  src/lib/client/__tests__/*.test.ts src/lib/server/__tests__/*.test.ts src/lib/llm/__tests__/*.test.ts
corepack pnpm@10.30.3 build
```

환경 내 검증 자료: `/workspace/request-validation/`의 `final-tests.log`, `build.log`, `production-report.json`, `UI-VALIDATION.md`, `browser-final-report.json`, `index.html`. 화면 미리보기와 수치는 이번 작업에서 직접 실행한 결과이다.


## 수정 파일 전체

- `docs/ui-learning-corrections.md`
- `scripts/smoke-api.ts`
- `src/app/api/runs/[id]/final/route.ts`
- `src/app/dev/assets/page.tsx`
- `src/app/dev/game/page.tsx`
- `src/app/page.tsx`
- `src/components/album/AlbumPage.tsx`
- `src/components/auth/LoginScreen.tsx`
- `src/components/auth/login.css`
- `src/components/exam/AnswerSheet.tsx`
- `src/components/exam/Choices.tsx`
- `src/components/exam/LearningErrorFeedback.tsx`
- `src/components/exam/pages/ExamPage.tsx`
- `src/components/exam/pages/ResultPage.tsx`
- `src/components/exam/pages/ReviewPage.tsx`
- `src/components/game/FinalExamAction.tsx`
- `src/components/game/JuniorAvatar.tsx`
- `src/components/game/JuniorOrMascot.tsx`
- `src/components/game/JuniorSelect.tsx`
- `src/components/game/JuniorTrio.tsx`
- `src/components/game/characters.ts`
- `src/components/game/editorial.css`
- `src/components/game/junior-trio.css`
- `src/components/home/TodayTasks.tsx`
- `src/components/onboarding/Orientation.tsx`
- `src/components/onboarding/orientation.css`
- `src/components/session/SpeechBubble.tsx`
- `src/components/session/session.css`
- `src/components/session/teach/TeachPage.tsx`
- `src/components/wrong-notes/WrongNoteDetail.tsx`
- `src/contracts/game.ts`
- `src/contracts/types.ts`
- `src/lib/client/achievements.ts`
- `src/lib/client/game-api.ts`
- `src/lib/learning/error-reason.ts`
- `src/lib/llm/__tests__/exam-knowledge.test.ts`
- `src/lib/llm/__tests__/knowledge-persistence.test.ts`
- `src/lib/llm/__tests__/personas.test.ts`
- `src/lib/llm/__tests__/routes.test.ts`
- `src/lib/llm/__tests__/teaching.test.ts`
- `src/lib/llm/exam-grounding.ts`
- `src/lib/llm/live.ts`
- `src/lib/llm/personas.ts`
- `src/lib/llm/prompts/analyze-turn.ts`
- `src/lib/llm/prompts/grade-exam.ts`
- `src/lib/llm/prompts/prepare-session.ts`
- `src/lib/llm/prompts/respond-turn.ts`
- `src/lib/llm/prompts/teaching-choices.ts`
- `src/lib/llm/prompts/write-exam-answer.ts`
- `src/lib/llm/provider.ts`
- `src/lib/llm/routes/handlers.ts`
- `src/lib/llm/routes/prisma-backend.ts`
- `src/lib/llm/schemas.ts`
- `src/lib/llm/stub.ts`
- `src/lib/llm/teaching-choices.ts`
- `src/lib/llm/types.ts`
- `src/lib/server/__tests__/change-character.test.ts`
- `src/lib/server/run-dto.ts`
- `src/lib/server/session-dto.ts`
- `src/lib/server/wrong-note.ts`
