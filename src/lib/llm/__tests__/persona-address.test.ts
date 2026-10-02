import assert from "node:assert/strict";
import test from "node:test";
import { normalizePersonaAddress, personaQuestion, PERSONAS } from "../personas";

const humanJuniors = ["MALE_EASY", "FEMALE_NORMAL"] as const;

test("ordinary human-junior reactions remove repeated direct address, without adding another greeting", () => {
  for (const character of humanJuniors) {
    assert.equal(normalizePersonaAddress("선배님, 알 것 같습니다! 선배님, 감사합니다!", character, { kind: "reaction" }),
      "알 것 같습니다! 감사합니다!");
    assert.equal(normalizePersonaAddress("선배님~ 그런 의미였네요!", character, { kind: "reaction" }), "그런 의미였네요!");
    assert.equal(normalizePersonaAddress("이제 알 것 같아요, 선배님!", character, { kind: "reaction" }), "이제 알 것 같아요!");
    assert.equal(normalizePersonaAddress("아하, 알 것 같아요!", character, { kind: "reaction" }), "아하, 알 것 같아요!");
  }
});

test("a genuine help request may address the senior politely, while repeated calls can be suppressed", () => {
  for (const character of humanJuniors) {
    const request = "선배, 이 부분만 한 번 더 설명해 주실 수 있나요?";
    assert.equal(normalizePersonaAddress(request, character, { kind: "question" }),
      "선배님, 이 부분만 한 번 더 설명해 주실 수 있나요?");
    assert.equal(normalizePersonaAddress(request, character, { kind: "question", allowAddress: false }),
      "이 부분만 한 번 더 설명해 주실 수 있나요?");
  }
});

test("address cleanup preserves quoted teaching and ordinary references to a senior's role", () => {
  for (const character of humanJuniors) {
    const roleDescription = "선배가 맡은 역할은 자료 정리입니다. 선배와 후배가 협력합니다. 선배님께 받은 자료도 있습니다.";
    assert.equal(normalizePersonaAddress(roleDescription, character, { kind: "reaction" }), roleDescription);
    for (const quotation of ['“선배님, 알려주세요.”', '「선배, 알려주세요.」', '"선배님, 알려주세요."', "‘선배님, 알려주세요.’", "'선배님, 알려주세요.'", "`선배님, 알려주세요.`"]) {
      assert.equal(normalizePersonaAddress(`선배님, ${quotation}라는 예시를 배웠습니다.`, character, { kind: "reaction" }),
        `${quotation}라는 예시를 배웠습니다.`);
    }
  }
});

test("deterministic learning questions and reactions use each human junior's register without a fixed address prefix", () => {
  for (const topic of ["준비 상태", "스케줄러", "디스패처", "프로세스", "스레드"]) {
    for (const first of [true, false]) {
      assert.doesNotMatch(personaQuestion(topic, "MALE_EASY", first), /선배/u);
      assert.match(personaQuestion(topic, "MALE_EASY", first), /습니다[.!?]?$/u);
      assert.doesNotMatch(personaQuestion(topic, "FEMALE_NORMAL", first), /선배/u);
      assert.match(personaQuestion(topic, "FEMALE_NORMAL", first), /요[.!?]?$/u);
    }
  }
  assert.match(PERSONAS.MALE_EASY.examples.reaction, /습니다[.!?]?$/u);
  assert.match(PERSONAS.FEMALE_NORMAL.examples.reaction, /요[.!?]?$/u);
  for (const character of humanJuniors) assert.doesNotMatch(PERSONAS[character].examples.reaction, /선배/u);
});

test("KU's existing dialogue and address conversion remain unchanged by the human-junior rule", () => {
  assert.equal(personaQuestion("준비 상태", "KU_HARD", true), "선배, 준비 상태부터 말해 줘.");
  assert.equal(personaQuestion("준비 상태", "KU_HARD"), "선배, 준비 상태를 다른 말로 한 번 더 설명해 줘.");
  assert.equal(personaQuestion("수요 법칙", "KU_HARD"), "선배, 수요 법칙을 다른 말로 한 번 더 설명해 줘.");
  assert.equal(PERSONAS.KU_HARD.examples.reaction, "음... 대충 알 것 같아.");
  assert.equal(PERSONAS.KU_HARD.examples.doubt, "잠깐만 선배. 그러면 가격이 오르면 수요도 늘어난다는 거야?");
  assert.equal(normalizePersonaAddress('선배님, “선배님께서 설명했다”라고 들었어.', "KU_HARD", { kind: "reaction", allowAddress: false }),
    '선배, “선배님께서 설명했다”라고 들었어.');
  assert.equal(normalizePersonaAddress("선배님, 알 것 같아요."), "선배님, 알 것 같아요.");
});

test("female questions avoid repeating meaning and reason already present in the topic", () => {
  assert.equal(personaQuestion("수요의 의미", "FEMALE_NORMAL"), "수요의 의미를 설명해 주실래요?");
  assert.equal(personaQuestion("수요 법칙의 전제", "FEMALE_NORMAL"), "수요 법칙의 전제를 설명해 주실래요?");
  assert.equal(personaQuestion("수요", "FEMALE_NORMAL"), "수요의 의미와 이유를 설명해 주실래요?");
});
