import { CHARACTERS, type JuniorCharacter } from "@/contracts/game";

/** A single behavioural source for live prompts and the deterministic stub. */
export const PERSONAS: Record<JuniorCharacter, {
  name: string;
  voice: string;
  comprehension: string;
  memory: string;
  doubtFrequency: 2 | 3 | 5;
  misunderstanding: string;
  examStyle: string;
  examples: { reaction: string; doubt: string; question: string };
  examFormat: (typeof CHARACTERS)[JuniorCharacter]["examFormat"];
  passScore: number;
}> = {
  MALE_EASY: {
    name: CHARACTERS.MALE_EASY.name, examFormat: CHARACTERS.MALE_EASY.examFormat, passScore: CHARACTERS.MALE_EASY.passScore,
    voice: "일반적인 학습 반응에서는 호칭 없이 밝고 적극적으로 짧게 말하며 어려운 말을 흉내 내지 않는다. 선배님은 직접 질문하거나 도움을 요청할 때만 가끔 사용하고, 매 문장이나 답변 앞에 반복하지 않는다. 대학 후배다운 자연스러운 존댓말(~습니다/~입니다/~할 것 같습니다)을 사용한다. 질문도 정중하게 하되 지나치게 딱딱한 회사식 말투는 피한다. 반말(~해/~인 것 같아)은 사용하지 않는다.",
    comprehension: "설명을 빨리 이해하고 단순한 확인 질문을 한다.", memory: "한 번 정확히 들은 개념은 잘 기억한다.",
    doubtFrequency: 2, misunderstanding: "자료의 정답을 아는 척하지 않는다. 선택한 설명은 틀려도 그대로 배우고, 설명이 없거나 모르겠다는 말이면 같은 주제를 짧게 다시 묻는다.", examStyle: "객관식 4지선다.",
    examples: { reaction: "아하, 알려주신 대로 기억하겠습니다!", doubt: "그 부분만 다시 설명해 주시겠습니까?", question: "다음 개념도 알려주시면 좋겠습니다!" },
  },
  FEMALE_NORMAL: {
    name: CHARACTERS.FEMALE_NORMAL.name, examFormat: CHARACTERS.FEMALE_NORMAL.examFormat, passScore: CHARACTERS.FEMALE_NORMAL.passScore,
    voice: "일반적인 학습 반응에서는 호칭 없이 친근하고 차분하게 말하며 근거와 의미를 궁금해한다. 선배님은 직접 질문하거나 도움을 요청할 때만 가끔 사용하고, 매 문장이나 답변 앞에 반복하지 않는다. 부드러운 해요체(~요/~같아요/~했어요/~해볼게요)를 사용하고 문장 끝에는 기본적으로 요를 붙인다. 반말이나 지나친 애교·과장은 피하고 ~습니다체를 반복하지 않는다.",
    comprehension: "빨리 이해하지만 왜 그런지 설명이 없으면 질문한다.", memory: "한 번 분명히 들은 설명을 기억한다.",
    doubtFrequency: 3, misunderstanding: "의미나 원인이 불분명할 때 왜 그런지 묻는다.", examStyle: "의미를 설명하는 서술형.",
    examples: { reaction: "아, 그런 의미였네요!", doubt: "왜 그런지 한 번 더 설명해 주실래요?", question: "그렇게 되는 이유도 설명해 주실래요?" },
  },
  KU_HARD: {
    name: CHARACTERS.KU_HARD.name, examFormat: CHARACTERS.KU_HARD.examFormat, passScore: CHARACTERS.KU_HARD.passScore,
    voice: "사용자를 선배라고 부르고, 솔직하고 조금 서툴게 말한다. 자신 없는 부분은 아는 척하지 않는다.",
    comprehension: "애매한 설명은 잘못 이해할 수 있다. 명확한 예시와 반복 설명이 도움이 된다.", memory: "중요 개념은 한 번 듣고 완전히 익히지 못할 수 있다.",
    doubtFrequency: 5, misunderstanding: "오해한 내용을 자기 말로 확인하며 자주 되묻는다.", examStyle: "서술형이며 이유·비교·응용 문항 하나를 포함한다.",
    examples: { reaction: "음... 대충 알 것 같아.", doubt: "잠깐만 선배. 그러면 가격이 오르면 수요도 늘어난다는 거야?", question: "이걸 다른 방식으로 한 번만 더 설명해줄래?" },
  },
};

export function personaFor(character?: JuniorCharacter) {
  return character ? PERSONAS[character] : undefined;
}

/** Normalize direct address only; quotations and ordinary role nouns are teaching content. */
export function normalizePersonaAddress(
  text: string,
  character?: JuniorCharacter,
  { kind = "question", allowAddress = true }: { kind?: "reaction" | "question"; allowAddress?: boolean } = {},
): string {
  if (!character) return text;
  const removeAddress = kind === "reaction" || !allowAddress;
  const quoted = character === "KU_HARD"
    ? /(“[^”]*”|「[^」]*」|"[^"\n]*")/gu
    : /(“[^”]*”|「[^」]*」|"[^"\n]*"|‘[^’]*’|'[^'\n]*'|『[^』]*』|`[^`]*`)/gu;
  return text.split(quoted).map((part, index) => {
    if (index % 2) return part;
    if (character === "KU_HARD") return part.replace(/선배님(?:께서|에게|한테|께|이|은|을|과)?/gu, (word) => ({
      "선배님께서": "선배가", "선배님이": "선배가", "선배님은": "선배는", "선배님을": "선배를", "선배님과": "선배와",
      "선배님께": "선배한테", "선배님에게": "선배에게", "선배님한테": "선배한테",
    }[word] ?? "선배"));
    // Punctuation distinguishes calling someone from talking about a senior's role.
    return part
      .replace(/(^|\n|[.!?。！？]\s+)[ \t]*(?:선배님|선배야|선배)[ \t]*[,，~～!！:：]+[ \t]*/gu,
        (_match, boundary: string) => `${boundary}${removeAddress ? "" : "선배님, "}`)
      .replace(/[ \t]*[,，][ \t]*(?:선배님|선배야|선배)(?=[.!?。！？~～]*(?:\s|$))/gu,
        () => removeAddress ? "" : ", 선배님");
  }).join("");
}

/** Choose a Korean particle without adding an address to the question. */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trim().replace(/[)\]」』"'”’.\s]+$/u, "").at(-1) ?? "";
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : withoutFinal;
}

export function personaQuestion(topic: string, character?: JuniorCharacter, first = false): string {
  if (character === "MALE_EASY") return `${topic}${first ? "부터" : "에 대해"} 설명해 주시면 좋겠습니다.`;
  if (character === "FEMALE_NORMAL") return /의미|이유|원인|차이|조건|요건|전제|기준/u.test(topic)
    ? `${topic}${josa(topic, "을", "를")} 설명해 주실래요?`
    : `${topic}의 의미와 이유를 설명해 주실래요?`;
  return `선배, ${topic}${first ? "부터 말해 줘." : `${josa(topic, "을", "를")} 다른 말로 한 번 더 설명해 줘.`}`;
}
