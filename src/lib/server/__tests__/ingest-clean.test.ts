import assert from "node:assert/strict";
import test from "node:test";
import { cleanPdfPages, normalizeText } from "@/lib/server/ingest";

test("normalizeText turns PDF control-character spaces into real spaces", () => {
  assert.equal(normalizeText("하향식\u0007소프트웨어\u0007개발을\u0007위한\u0007도구이다."), "하향식 소프트웨어 개발을 위한 도구이다.");
});

test("cleanPdfPages drops page marks, running headers, purchaser and copyright lines, and keeps the body", () => {
  const header = "정보처리기사 핵심 요약";
  const pages = [
    `${header}\n시험에\n나오는 것만\n- 1 -\n구매자: someone@example.com\n이 자료는 대한민국 저작권법의 보호를 받습니다.\n1. 소프트웨어 구축\n■ 소프트웨어 생명 주기\n폭포수 선형 순차적 개발 모형이다.\n•\n보헴이 제시한 고전적 모형이다.`,
    `${header}\n시험에\n나오는 것만\n- 2 -\n■ 요구사항 분석\n요구사항은 문제를 해결하기 위한 조건이다.`,
    `${header}\n시험에\n나오는 것만\n-- 3 of 3 --\n※ 익스트림 프로그래밍\n5가지 핵심 가치가 있다.`,
  ];
  const text = cleanPdfPages(pages);
  assert.ok(!text.includes(header) && !text.includes("나오는 것만"), "반복 머리말 제거");
  assert.ok(!/- \d -|of 3|구매자|저작권법/u.test(text), "쪽 번호·구매자·저작권 문구 제거");
  assert.ok(text.includes("• 보헴이 제시한 고전적 모형이다."), "글머리 기호만 있는 줄을 다음 줄과 합침");
  assert.ok(text.includes("\n\n■ 소프트웨어 생명 주기") && text.includes("\n\n■ 요구사항 분석") && text.includes("\n\n※ 익스트림 프로그래밍"), "제목 앞 문단 경계");
  assert.ok(text.startsWith("1. 소프트웨어 구축"));
  assert.ok(text.includes("폭포수 선형 순차적 개발 모형이다.") && text.includes("요구사항은 문제를 해결하기 위한 조건이다."));
});

test("cleanPdfPages leaves ordinary short documents untouched apart from trimming", () => {
  const text = cleanPdfPages(["첫 줄입니다.\n둘째 줄입니다.", "셋째 줄입니다."]);
  assert.equal(text, "첫 줄입니다.\n둘째 줄입니다.\n\n셋째 줄입니다.");
});
