# D 데모 자료와 골든 세션

두 강의노트는 이 프로젝트를 위해 직접 작성했습니다. 외부 교재를 복제하거나 분량을 맞추기 위해 같은 문단을 반복하지 않았습니다.

| 자료 | 파일 | 글자 수 | 목차 수 | 데모 목차 |
| --- | --- | ---: | ---: | --- |
| 운영체제 | `operating-systems.md` | 7,310 | 8 | 스케줄링의 출발점 |
| 경제학원론 | `economics.md` | 6,999 | 8 | 수요의 이해 |

`chapters.os.json`과 `chapters.economics.json`은 C의 시드 및 D의 오프라인 목차 생성을 위한 메타데이터입니다.

```ts
type ChapterFixture = {
  title: string;
  courseName: string;
  fileName: string;
  sourceId: string;
  sourceSha256: string;
  chapters: {
    title: string;
    points: string[];
    sourceId: string;
    startOffset: number;
    endOffset: number;
  }[];
};
```

오프셋은 원본 UTF-8 파일을 문자열로 읽은 뒤 JavaScript `text.slice(startOffset, endOffset)`에 넣는 반열린 구간입니다. 바이트 오프셋이 아닙니다. 두 파일에는 UTF-16 보조 평면 문자가 없으므로 코드 포인트 수와 JavaScript 문자열 길이가 같습니다. 첫 목차는 자료의 제목과 서문을 포함하며, 전체 구간은 0부터 `text.length`까지 중복이나 누락 없이 이어집니다. 모든 목차는 300~4,000자이고 포인트는 각각 3개입니다. 파일 내용을 바꾸거나 줄바꿈을 CRLF로 바꾸면 해시와 오프셋을 다시 계산해야 합니다.

C의 시드에서는 `sourceId`를 실제 생성한 Source ID로 매핑하고, 각 챕터에 `materialId`, `order`(1부터), 생성한 `id`, `pointsJson: JSON.stringify(points)`를 더하면 됩니다. 실제 데이터베이스의 ID가 fixture ID와 같을 필요는 없습니다. 강의노트 파일은 Next.js의 정적 공개 경로가 아니므로 A의 샘플 업로드 UI는 A 소유의 적절한 전달 경로로 파일을 제공해야 합니다.

## 세션 fixture 형식

`demo.os.json`과 `demo.economics.json`은 첫 목차에 대한 다음 항목을 담고 있습니다.

- `chapterIndex`: 목차 배열의 0 기반 인덱스.
- `prepare`: 학습목표 3개, 문항 3개(34/33/33점), rubric, 첫 질문.
- `wrongExplanation`, `correctedExplanation`: 되묻기와 정정 입력.
- `taught`: USER 설명 원문. `ref=1`은 틀린 설명, `ref=2`는 첫 개념의 정정, `ref=3`은 두 번째 개념의 설명입니다.
- `heardConcepts`: 올바르게 다룬 두 개념. 세 번째 개념은 일부러 가르치지 않습니다.
- `turns`: EASY 되묻기 및 정정 후 반응의 예시 이벤트. 되묻기는 기존 개념을 유지하고 `added: []`인 `concepts` 후 `doubt`로 끝납니다.
- `answers`, `grades`: 위 입력에 대한 골든 답안 및 채점 예시.
- `rubricChecks`: 데모에서 채점 요소를 판별하는 한국어 정규식. 실제 LLM의 채점 기준을 대체하지 않습니다.
- `expectedTotalScore`, `expectedFinalVerdict`: 각각 67, `NEEDS_WORK`.

설계서의 배점과 판정 기준을 그대로 적용하면 세 번째 문항을 전혀 가르치지 않은 시나리오의 최고 점수는 `34 + 33 = 67`입니다. 설계서 §10의 마지막 멘트인 “대부분 이해”(70점 이상)와는 맞지 않습니다. 데모는 점수를 부풀리지 않습니다. “대부분 이해” 판정을 보이려면 세 번째 문항도 일부 가르치는 별도 시나리오가 필요합니다.

## 실행 및 검증

```bash
LLM_PROVIDER=stub LLM_STUB_DELAY_MS=0 pnpm eval:llm
```

일반 데모는 `LLM_PROVIDER=stub`만 지정합니다. 문장당 지연은 기본 300ms이고 `LLM_STUB_DELAY_MS=0`으로 테스트를 빠르게 실행할 수 있습니다. API 키는 사용하지 않습니다. HTTP 라우트에서 C의 DB·인증 모듈을 아직 사용할 수 없는 경우의 별도 로컬 백엔드 설정은 `src/lib/llm/README.md`를 참고하세요.

경제학 시연 입력은 `taught`의 순서대로 보내면 됩니다. EASY에서 첫 입력은 정답을 공개하지 않는 되묻기를 발생시키고, 두 번째 입력은 정정으로 받아들입니다. 시험에서는 첫 문항이 두 번째 USER 설명을, 두 번째 문항이 세 번째 USER 설명을 인용합니다. 세 번째 문항은 `ref: null`, `level: "NONE"`, `unlearned: true`와 함께 “이 부분은 선배한테 못 들어서 모르겠습니다.”를 반환합니다. HARD에서는 틀린 설명에도 되묻지 않으므로 설명을 정정하지 않으면 틀린 내용을 답안에 쓰고 자료 기준으로 오답 처리됩니다.

## stub의 범위

`src/lib/llm/stub.ts`는 두 자료의 첫 목차에 맞춘 결정적 데모 구현입니다. 두 원문과 일치하는 입력에는 fixture의 목차를 사용하고, 다른 입력은 본문 범위를 보존해 단순 분할합니다. 4개 이상의 목차를 만들 수 없는 짧은 본문은 명시적인 오류를 반환합니다.

시험 답안은 전달받은 `taught`의 관련 문장을 그대로 인용해 존댓말로 감쌉니다. 원문, 모범답안, rubric에서 답을 가져오지 않으며 개념 이름만 들었다고 답을 생성하지 않습니다. 원래 USER 순번을 유지하고 같은 개념을 나중에 정정한 경우 최신 설명을 선택합니다. `excluded` 처리는 호출 라우트가 수행하므로 제외한 설명은 이 함수에 전달하지 않아야 합니다.

한국어 표현을 완전히 이해하는 구현은 아닙니다. 데모 밖의 바꿔 말한 표현이나 여러 메시지에 흩어진 근거는 보수적으로 놓칠 수 있고, 다른 목차의 준비·채점은 단순 키워드 방식입니다. 되묻기는 명백한 수요 법칙의 반대 설명과 비선점형 CPU 회수 설명만 다룹니다. 튜터는 실제 자료 문장을 인용한 정해진 설명 형식을 사용합니다. 일반적인 자료와 자유로운 질문은 OpenAI 또는 Anthropic 구현으로 검증해야 합니다.
