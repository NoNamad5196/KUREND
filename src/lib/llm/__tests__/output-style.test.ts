import assert from "node:assert/strict";
import test from "node:test";
import { answerStyle, examQuestionText, isConversationalQuestion, plainText, isUnlearnedAnswer, containsUnlearnedAnswer, UNLEARNED_ANSWER } from "../text";
import { prepareSessionSchemaFor } from "../schemas";

test("model text never keeps markdown emphasis", () => {
  assert.equal(plainText("**수요 법칙**은 `가격`과 __수요량__의 관계다."), "수요 법칙은 가격과 수요량의 관계다.");
  assert.equal(plainText("## 정리\n핵심"), "정리\n핵심");
});

test("exam questions are written like an exam sheet, not like a chat", () => {
  assert.equal(examQuestionText("**수요 법칙**을 설명하세요."), "수요 법칙을 설명하시오.");
  assert.equal(examQuestionText("선배님, 기아 현상의 해결책을 서술하세요!"), "기아 현상의 해결책을 서술하시오.");
  for (const chatty of ["수요 법칙이 뭐예요?", "선배님 이건 왜 그런가요?", "수요곡선은 왜 우하향할까?", "이유가 뭐야?"]) {
    assert.ok(isConversationalQuestion(chatty), chatty);
  }
  for (const formal of ["수요 법칙을 설명하시오.", "다음 중 옳은 것은?", "수요량의 변화와 수요의 변화를 비교하여 서술하시오.", "기아 현상이란 무엇인가?"]) {
    assert.ok(!isConversationalQuestion(formal), formal);
  }
  const plan = { qid: "q1", order: 1, points: 100, objectiveRef: "o1", rubric: "가격;수요량" };
  const base = { objectives: [{ id: "o1", text: "**수요 법칙**을 설명할 수 있다" }], firstQuestion: "선배님, 수요 법칙부터 알려주세요!" };
  const parsed = prepareSessionSchemaFor(1).parse({ ...base, questions: [{ ...plan, question: "선배님, **수요 법칙**을 설명하세요." }] });
  assert.equal(parsed.questions[0].question, "수요 법칙을 설명하시오.");
  assert.equal(parsed.objectives[0].text, "수요 법칙을 설명할 수 있다");
  assert.equal(prepareSessionSchemaFor(1).safeParse({ ...base, questions: [{ ...plan, question: "수요 법칙이 뭐예요?" }] }).success, false);
});

test("unlearned answers use exam-sheet wording and still recognize the old chat wording", () => {
  assert.ok(isUnlearnedAnswer(UNLEARNED_ANSWER));
  assert.ok(isUnlearnedAnswer(`② ${UNLEARNED_ANSWER}`));
  assert.ok(isUnlearnedAnswer("이 부분은 선배한테 못 들어서 모르겠습니다."));
  assert.ok(containsUnlearnedAnswer("③ 이 부분은 선배님께 못 들어서 모르겠습니다."));
  assert.ok(!/선배|요\./u.test(UNLEARNED_ANSWER));
});

test("exam answers end like an answer sheet even when the senior taught in casual speech", () => {
  assert.equal(answerStyle("수요곡선은 오른쪽 아래로 내려가는 우하향 모양이야."), "수요곡선은 오른쪽 아래로 내려가는 우하향 모양이다.");
  assert.equal(answerStyle("가격이 오르면 수요량은 줄어. 가격이 내리면 늘어."), "가격이 오르면 수요량은 줄어든다. 가격이 내리면 늘어난다.");
  assert.equal(answerStyle("그래서 곡선 전체라고 보면 돼."), "그래서 곡선 전체라고 볼 수 있다.");
  assert.equal(answerStyle("수요량의 변화는 그 재화 가격 때문이에요."), "수요량의 변화는 그 재화 가격 때문이다.");
  assert.equal(answerStyle("이미 답안 문체이다."), "이미 답안 문체이다.");
});
