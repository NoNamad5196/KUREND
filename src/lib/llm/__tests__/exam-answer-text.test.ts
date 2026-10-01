import assert from "node:assert/strict";
import { test } from "node:test";
import { plainExamAnswer } from "../../shared/exam-answer-text";

test("exam prose removes address and learned-quote framing across persona voices", () => {
  assert.equal(plainExamAnswer("선배님, 수요는 가격과 수량의 관계예요."), "수요는 가격과 수량의 관계다.");
  assert.equal(plainExamAnswer("응, 프로세스는 실행 중인 프로그램이야."), "프로세스는 실행 중인 프로그램이다.");
  assert.equal(plainExamAnswer("“가격이 오르면 수요량은 줄어들어.”라고 배웠습니다."), "가격이 오르면 수요량은 줄어든다.");
  assert.equal(plainExamAnswer("스레드는 주소 공간을 공유해요, 선배님."), "스레드는 주소 공간을 공유한다.");
  assert.equal(plainExamAnswer("“가격은 올라. 수요량은 줄어.”라고 배웠습니다. “조건이 같아야 해.”라고 배웠습니다."), "가격은 오른다. 수요량은 줄어든다. 조건이 같아야 한다.");
});

test("formatting preserves conditions, negation, amounts, and uncertainty", () => {
  assert.equal(plainExamAnswer("다른 조건이 같으면 가격은 2.5% 올라. 수요량은 늘어나지 않아."), "다른 조건이 같으면 가격은 2.5% 오른다. 수요량은 늘어나지 않는다.");
  assert.equal(plainExamAnswer("제 생각에는 수요 변화인 것 같아."), "수요 변화인 것으로 보인다.");
  assert.equal(plainExamAnswer("항상 증가하는 것은 아니야. 영향이 없어요."), "항상 증가하는 것은 아니다. 영향이 없다.");
  assert.equal(plainExamAnswer("실행을 기다려. 조건을 확인해야 해."), "실행을 기다린다. 조건을 확인해야 한다.");
});

test("common formal endings become exam prose without removing negation or uncertainty", () => {
  assert.equal(plainExamAnswer("준비 상태는 CPU를 기다리는 상태입니다. 스레드는 주소 공간을 공유합니다."), "준비 상태는 CPU를 기다리는 상태이다. 스레드는 주소 공간을 공유한다.");
  assert.equal(plainExamAnswer("조건이 필요합니다. 반드시 증가하는 것은 아닙니다. 자원은 없습니다."), "조건이 필요하다. 반드시 증가하는 것은 아니다. 자원은 없다.");
  assert.equal(plainExamAnswer("지연될 수도 있습니다. 손실이 발생한 것 같습니다. 중단될 듯합니다. 다시 실행됩니다."), "지연될 수도 있다. 손실이 발생한 것으로 보인다. 중단될 듯하다. 다시 실행된다.");
  assert.equal(plainExamAnswer("영향이 적습니다. 값은 `준비 상태입니다`입니다.\n    print('실행됩니다')\n"), "영향이 적습니다. 값은 `준비 상태입니다`이다.\n    print('실행됩니다')\n");
});

test("markdown stripping changes presentation without changing quoted terms or role nouns", () => {
  assert.equal(plainExamAnswer("**프로세스**는 실행 중인 프로그램이야."), "프로세스는 실행 중인 프로그램이다.");
  assert.equal(plainExamAnswer('선배의 역할은 안내이다. 네 가지 연구 분야. 경제적 피해. 용어는 "마야"이다.'), '선배의 역할은 안내이다. 네 가지 연구 분야. 경제적 피해. 용어는 "마야"이다.');
  assert.equal(plainExamAnswer("‘선배님’은 호칭이다."), "‘선배님’은 호칭이다.");
  assert.equal(plainExamAnswer("가격이 증가한 거야?"), "가격이 증가한 거야?");
});

test("formatting is idempotent and does not invent an answer from a greeting", () => {
  assert.equal(plainExamAnswer("안녕하세요! 네, 선배님, 프로세스는 실행을 기다려요."), "프로세스는 실행을 기다린다.");
  const answer = "조건이 같으면 수요량은 줄어든다. 영향이 없을 수도 있다.";
  assert.equal(plainExamAnswer(plainExamAnswer(answer)), answer);
  assert.equal(plainExamAnswer("안녕하세요!"), "");
});

test("code and mathematical notation retain their exact content, indentation, and line breaks", () => {
  const fenced = "```python\nif ready:\n    result = 2 ** 3\n    print('선배님, 기다려')\n```\n";
  const indented = "    result = 2 ** 3\n    print('값이야')\n";
  const formula = "$$\nf(x) = x ** 2\n$$";
  const input = `**조건**이 필요해.\n${fenced}${indented}계산식은 ${formula}이다. 코드 예는 \`선배님, 기다려\`이다. \\[x^2 + y^2\\]`;
  const answer = plainExamAnswer(input);
  assert.equal(answer, input.replace("**조건**이 필요해.", "조건이 필요하다."));
  assert.equal(plainExamAnswer(indented), indented);
});
