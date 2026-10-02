import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveLlm } from "../live";
import { stubLlm } from "../stub";
import { modelKeywordsFor, modelKeywordsSchema, modelAnswersFor } from "../teaching-choices";
import { teachingChoiceKind } from "@/lib/shared/teaching-hints";

const chapter = {
  title: "프로세스 상태", points: ["준비 상태", "실행 상태", "대기 상태", "종료 상태", "생성 상태"],
  text: "준비 상태는 CPU 할당을 기다리는 상태이다. 준비 상태의 프로세스는 준비 큐에서 디스패치를 기다린다. 실행 상태는 CPU를 사용하여 명령을 실행하는 상태이다. 대기 상태는 입출력 완료를 기다리는 상태이다. 종료 상태는 프로세스 실행을 마친 상태이다. 생성 상태는 프로세스를 생성하는 상태이다.",
};

test("실제 계정용 모범 키워드: 자료 용어 3개(주제어 제외), id 는 keyword_ 접두어", () => {
  const keywords = modelKeywordsFor(chapter, "준비 상태");
  assert.ok(keywords.length >= 1 && keywords.length <= 3);
  assert.ok(keywords.every((choice) => /^keyword_\d$/u.test(choice.id) && chapter.text.includes(choice.text) && !choice.text.includes("준비")));
  assert.ok(keywords.some((choice) => /CPU|할당|디스패치|준비 큐|큐/u.test(choice.text)), JSON.stringify(keywords));
  assert.equal(teachingChoiceKind(keywords), "keywords");
  assert.equal(teachingChoiceKind(modelAnswersFor(chapter, "준비 상태")), "answers");
  assert.equal(teachingChoiceKind(undefined), "answers");
});

test("모델 키워드 검증: 자료에 없는 말·문장·주제어·호칭은 거절", () => {
  const schema = modelKeywordsSchema(chapter, "준비 상태");
  assert.throws(() => schema.parse({ keywords: ["CPU 할당", "레지스터 스왑"] }), /자료\(source\)/u);
  assert.throws(() => schema.parse({ keywords: ["CPU 할당을 기다리는 상태이다."] }), /명사형/u);
  assert.throws(() => schema.parse({ keywords: ["준비 상태"] }), /주제어/u);
  assert.throws(() => schema.parse({ keywords: ["선배 CPU"] }), /명사형/u);
  assert.throws(() => schema.parse({ keywords: ["CPU 할당", "CPU 할당"] }), /서로 달라야/u);
  assert.deepEqual(schema.parse({ keywords: ["CPU 할당", "디스패치", "준비 큐"] }).keywords, ["CPU 할당", "디스패치", "준비 큐"]);
});

test("hintMode=keywords 면 stub·live 모두 답안 대신 키워드를 붙인다(모델 실패 시 결정적 키워드)", async () => {
  const prepared = await stubLlm.prepareSession({ chapter, level: "EASY", persona: "FEMALE_NORMAL", hintMode: "keywords" });
  assert.equal(teachingChoiceKind(prepared.firstTeachingChoices), "keywords");
  const answers = await stubLlm.prepareSession({ chapter, level: "EASY", persona: "FEMALE_NORMAL" });
  assert.equal(teachingChoiceKind(answers.firstTeachingChoices), "answers");

  const live = createLiveLlm({ async completeJSON(_prompt, user, schema) {
    const input = JSON.parse(user);
    assert.equal(input.topic, "준비 상태");
    assert.equal(input.previous, undefined, "키워드 요청에는 이전 답안이 없다");
    return schema.parse({ keywords: ["CPU 할당", "준비 큐", "디스패치"] });
  }, async *streamText() { throw new Error("unused"); } });
  const picked = await live.generateTeachingChoices!({ chapter, topic: "준비 상태", mode: "keywords" });
  assert.deepEqual(picked, [{ id: "keyword_1", text: "CPU 할당" }, { id: "keyword_2", text: "준비 큐" }, { id: "keyword_3", text: "디스패치" }]);
  const offline = createLiveLlm({ async completeJSON() { throw new Error("down"); }, async *streamText() { throw new Error("unused"); } });
  assert.equal(teachingChoiceKind(await offline.generateTeachingChoices!({ chapter, topic: "준비 상태", mode: "keywords" })), "keywords");
});
