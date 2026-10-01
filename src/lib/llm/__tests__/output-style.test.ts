import assert from "node:assert/strict";
import test from "node:test";
import { isUnlearnedAnswer, containsUnlearnedAnswer, hasLearnedAnswer, UNLEARNED_ANSWER } from "../text";
import { prepareSessionSchemaFor, examAnswerSchema } from "../schemas";
import { stripMarkdownBold } from "../../shared/plain-text";
import { plainExamAnswer } from "../../shared/exam-answer-text";
import { formatExamQuestion, isFormalExamQuestion } from "../../shared/exam-format";

test("AI emphasis is plain text while literal code and math keep their syntax", () => {
  assert.equal(stripMarkdownBold("**수요 법칙**은 가격과 수요량의 관계다."), "수요 법칙은 가격과 수요량의 관계다.");
  const literal = "`value ** 2`와 $x ** 2$\n```python\n    value = 2 ** 3\n```";
  assert.equal(stripMarkdownBold(literal), literal);
  assert.equal(plainExamAnswer(literal), literal);
});

test("preparation keeps formal questions and source-grounded objectives", () => {
  assert.equal(formatExamQuestion("**수요 법칙**을 설명하세요."), "수요 법칙을 설명하시오.");
  assert.equal(formatExamQuestion("선배님, 기아 현상의 해결책을 서술하세요!"), "기아 현상의 해결책을 서술하시오.");
  for (const question of ["수요 법칙이 뭐예요?", "선배님 이건 왜 그런가요?", "수요곡선은 왜 우하향할까?", "이유가 뭐야?"]) {
    assert.equal(isFormalExamQuestion(question), false);
  }
  const source = "다른 조건이 같으면 가격과 수요량은 반대로 움직인다.";
  const input = { objectives: [{ id: "o1", text: "**수요 법칙**을 설명할 수 있다", sourceQuote: source }],
    questions: [{ qid: "q1", order: 1, points: 100, objectiveRef: "o1", rubric: "다른 조건 일정;역관계", question: "선배님, **수요 법칙**을 설명하세요." }] };
  const schema = prepareSessionSchemaFor(1, [], source);
  const parsed = schema.parse(input);
  assert.equal(parsed.questions[0].question, "수요 법칙을 설명하시오.");
  assert.equal(parsed.objectives[0].text, "수요 법칙을 설명할 수 있다");
  assert.equal(schema.safeParse({ ...input, objectives: [{ ...input.objectives[0], sourceQuote: "없는 근거" }] }).success, false);
});

test("all previously stored unlearned markers remain zero-credit evidence", () => {
  for (const marker of [UNLEARNED_ANSWER, "이 부분은 선배한테 못 들어서 모르겠습니다.",
    "이 부분은 선배님께 못 들어서 모르겠습니다.", "배우지 못한 내용이라 답을 쓸 수 없음."]) {
    for (const prefix of ["", "② ", "2번 "]) {
      const answer = prefix + marker;
      assert.ok(isUnlearnedAnswer(answer));
      assert.ok(containsUnlearnedAnswer(answer));
      assert.equal(hasLearnedAnswer({ answer }, []), false);
      assert.equal(hasLearnedAnswer({ answer, sentences: [{ sentence: answer, ref: null, level: "NONE", unlearned: true }] }, []), false);
    }
  }
  assert.equal(hasLearnedAnswer({ answer: "2번" }, []), false);
  assert.equal(hasLearnedAnswer({ answer: "② 보기 문장. 배우지 못한 내용이라 답을 쓸 수 없음." }, []), false);
});

test("answer wording is derived from validated quotes, never freeform model claims", () => {
  const quote = "가격이 오르면 수요량은 줄어.";
  const parsed = examAnswerSchema([{ ref: 1, content: quote }]).parse({ thought: "학습 근거 확인 중", unlearned: false,
    sentences: [{ quote, answer: "소득 증가가 원인이다.", ref: 1, level: "STRONG" }] });
  assert.equal("answer" in parsed.sentences[0], false);
  assert.equal(plainExamAnswer(parsed.sentences[0].quote!), "가격이 오르면 수요량은 줄어든다.");
});
