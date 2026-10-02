import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveLlm } from "../live";

// 졸업시험처럼 가르친 설명이 많을 때(12개·1만 자 이상) 객관식 근거를 놓쳐 0점이 되던 문제의 회귀 테스트.
const explanations = [
  "개발 모형부터 보자. 폭포수는 단계별로 진행하는 고전적 선형 순차 모형이야. 나선형은 폭포수와 프로토타입에 위험 분석을 더해 위험을 관리해. 계획 수립, 위험 분석, 개발 및 검증, 고객 평가를 반복하는 점진적 개발이야.",
  "요구사항은 문제 해결의 조건·제약이야. 기능적 요구는 조회·입금 같은 기능, 비기능적 요구는 성능·보안·품질·안정성 조건이지. 개발 순서는 도출, 분석, 명세, 확인이야.",
  "설계는 분할과 정복으로 작은 서브시스템을 완성하고, 모듈화로 성능과 재사용성을 높여요. 응집도는 높을수록, 결합도는 낮을수록 좋아.",
  "객체지향은 객체·속성, 클래스·멤버로 나눠 분석해요. 스트래티지는 전략 패턴으로 동일 계열 알고리즘을 개별적으로 캡슐화해 상호 교환하고, 옵서버는 상태 변화를 전달해.",
  "테스트는 결함을 밝히지 무결함을 증명하진 못해. 동치 분할은 타당·부당 입력 수를 균등하게, 경계값은 구간 양끝을 검사해.",
  "데이터베이스는 조직에 필요한 데이터의 모임이야. 속성은 열, 튜플은 행이고 차수는 속성 수, 기수는 튜플 수야.",
  "키는 튜플 식별 기준이야. 후보키는 유일성과 최소성을 만족하고, 기본키는 중복과 NULL이 불가해.",
  "선형 검색은 순서대로 비교하고 이진 검색은 먼저 정렬해야 해. 해시는 O(1), 이진 탐색은 O(log N), 순차 탐색은 O(n)이야.",
];
const taught = explanations.map((content, index) => ({ ref: index + 1, content }));
const spiral = {
  question: "나선형 개발 모형의 단계 순서로 옳은 것을 고르시오.",
  choices: ["① 계획 수립 → 개발 및 검증 → 고객 평가 → 위험 분석", "② 계획 수립 → 위험 분석 → 개발 및 검증 → 고객 평가", "③ 위험 분석 → 고객 평가 → 계획 수립 → 개발 및 검증", "④ 고객 평가 → 개발 및 검증 → 위험 분석 → 계획 수립"],
};
const strategy = {
  question: "전략 패턴의 알고리즘 처리 방식에 관한 설명으로 옳은 것을 고르시오.",
  choices: ["① 동일 계열 알고리즘을 하나로 통합하여 상호 교환을 제한한다.", "② 동일 계열 알고리즘을 개별적으로 캡슐화하여 상호 교환을 제한한다.", "③ 동일 계열 알고리즘을 개별적으로 캡슐화하여 상호 교환한다.", "④ 동일 계열 알고리즘을 하나로 통합하여 항상 함께 실행한다."],
};
// 가르친 적 없는 개념(트랜잭션 원자성)
const untaught = {
  question: "트랜잭션의 ACID 특성 중 원자성에 관한 설명으로 옳은 것을 고르시오.",
  choices: ["① 트랜잭션의 연산은 모두 반영되거나 전혀 반영되지 않아야 한다.", "② 트랜잭션의 연산은 일부만 반영되어도 된다.", "③ 트랜잭션의 결과는 실행 중 다른 트랜잭션에 공개된다.", "④ 트랜잭션의 결과는 장애가 나면 사라져도 된다."],
};

async function sentenceOf(llm: ReturnType<typeof createLiveLlm>, item: { question: string; choices: string[] }) {
  const events: { type: string; text?: string; ref?: number | null; level?: string; unlearned?: boolean }[] = [];
  for await (const event of llm.writeExamAnswer({ question: item.question, taught, heardConcepts: [], choices: item.choices })) events.push(event as never);
  return events.find((event) => event.type === "sentence")!;
}
const unlearnedModel = (choice: string) => createLiveLlm({ async completeJSON(_prompt, _user, schema) {
  return schema.parse({ thought: "모르겠어.", choice, unlearned: true, sentences: [{ quote: null, ref: null, level: "NONE" }] });
}, async *streamText() { throw new Error("unused"); } });

test("long taught histories are trimmed to the relevant explanations and hinted with verbatim sentences", async () => {
  let seen: { taught: { ref: number }[]; taughtHints: { ref: number; quote: string }[] } | undefined;
  const llm = createLiveLlm({ async completeJSON(_prompt, user, schema) {
    seen = JSON.parse(user);
    return schema.parse({ thought: "근거를 찾았다.", choice: "②", unlearned: false,
      sentences: [{ quote: seen!.taughtHints[0].quote, ref: seen!.taughtHints[0].ref, level: "STRONG" }] });
  }, async *streamText() { throw new Error("unused"); } });
  const sentence = await sentenceOf(llm, spiral);
  assert.ok(seen!.taught.length <= 6 && seen!.taught.some((message) => message.ref === 1), "관련 설명(ref 1)은 남기고 무관한 설명은 줄인다");
  assert.ok(seen!.taughtHints.length > 0 && seen!.taughtHints.every((hint) => taught[hint.ref - 1].content.includes(hint.quote)), "힌트는 가르친 설명의 원문 그대로다");
  assert.match(seen!.taughtHints[0].quote, /계획 수립, 위험 분석, 개발 및 검증, 고객 평가/u);
  assert.deepEqual([sentence.text, sentence.ref, sentence.unlearned], ["2번", 1, false]);
});

test("a verified quote that supports the chosen option counts as evidence even when the options are near-identical", async () => {
  // 보기 ②와 ③은 '상호 교환한다/제한한다' 한 구절만 다르다. 검증된 인용이 모델의 선택과 맞으면 근거다.
  const llm = createLiveLlm({ async completeJSON(_prompt, _user, schema) {
    return schema.parse({ thought: "근거를 찾았다.", choice: "③", unlearned: false,
      sentences: [{ quote: "스트래티지는 전략 패턴으로 동일 계열 알고리즘을 개별적으로 캡슐화해 상호 교환하고, 옵서버는 상태 변화를 전달해.", ref: 4, level: "STRONG" }] });
  }, async *streamText() { throw new Error("unused"); } });
  const sentence = await sentenceOf(llm, strategy);
  assert.deepEqual([sentence.text, sentence.ref, sentence.level, sentence.unlearned], ["3번", 4, "STRONG", false]);

  // 배운 적 없는 개념을 무관한 인용으로 찍으면(자기 지식) 여전히 근거 없음이다.
  const guessing = createLiveLlm({ async completeJSON(_prompt, _user, schema) {
    return schema.parse({ thought: "찍어 볼게.", choice: "①", unlearned: false,
      sentences: [{ quote: "속성은 열, 튜플은 행이고 차수는 속성 수, 기수는 튜플 수야.", ref: 6, level: "FAINT" }] });
  }, async *streamText() { throw new Error("unused"); } });
  const guessed = await sentenceOf(guessing, untaught);
  assert.equal(guessed.unlearned, true);
  assert.equal(guessed.ref, null);
});

test("a false 'unlearned' is rescued only from an explanation about the asked concept that points at one option", async () => {
  // 순서 보기: 나선형을 설명한 문장의 구절 경계가 ②만 가리킨다 → 복구(FAINT)
  const rescued = await sentenceOf(unlearnedModel("②"), spiral);
  assert.deepEqual([rescued.text, rescued.ref, rescued.level, rescued.unlearned], ["2번", 1, "FAINT", false]);
  // 전략 패턴을 설명한 문장은 ③과 가장 가깝다 → 복구
  const strategyRescued = await sentenceOf(unlearnedModel("③"), strategy);
  assert.deepEqual([strategyRescued.text, strategyRescued.ref, strategyRescued.unlearned], ["3번", 4, false]);
  // 배운 적 없는 개념은 보기와 어휘가 겹치는 다른 설명이 있어도 복구하지 않는다(추측 금지)
  const stillUnlearned = await sentenceOf(unlearnedModel("①"), untaught);
  assert.equal(stillUnlearned.unlearned, true);
  assert.equal(stillUnlearned.ref, null);
});
