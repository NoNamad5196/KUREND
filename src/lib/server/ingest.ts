/**
 * [C 소유] 업로드 파일 → 텍스트 인제스트 (md / txt / pdf).
 *  - 최대 5개, 각 10MB (§5-4)
 *  - PDF 는 pdf-parse v2 (PDFParse.getText) 로 동기 추출
 *  - 추출 텍스트가 비면 400 VALIDATION "텍스트를 읽을 수 없는 파일"
 */
import { resolve } from "node:path";
import type { SourceKind } from "@/contracts/types";
import { validation } from "@/lib/server/http";

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIN_TEXT_CHARS = 20;

export type IngestedSource = { kind: SourceKind; fileName: string; text: string; charCount: number };

export function detectKind(fileName: string, mime?: string | null): SourceKind | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "md" || ext === "markdown") return "MD";
  if (ext === "txt" || ext === "text") return "TXT";
  if (ext === "pdf") return "PDF";
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/markdown") return "MD";
  if (mime === "text/plain") return "TXT";
  return null;
}

/** 줄바꿈 정규화, 제어 문자(일부 PDF 는 띄어쓰기를 U+0007 로 낸다) → 공백, 3줄 이상 빈 줄 → 2줄, 앞뒤 공백 제거 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/﻿/g, "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── PDF 정리: 어떤 자료를 올려도 AI 가 목차를 나눌 수 있게, 쪽 번호·반복 머리말·구매자/저작권 문구를 걷어내고 제목 앞에 문단 경계를 만든다 ── */
const PAGE_MARK = /^(?:-{1,2}\s*)?(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?\s*-{0,2}$/iu;
const BOILERPLATE = /구매자\s*[:：]|purchaser\s*:|licensed to\b|저작권법|작성자의 동의|무단\s*(?:복제|전재|배포)|2차적\s*저작물|손해배상|이하의 징역|all rights reserved|copyright\s*©?|^©|^ⓒ|^Ⓒ/iu;
const HEADING = /^(?:#{1,6}\s|[■□◆◇●○▶▷※☆★]\s?|제\s?\d+\s?[장절편부]\b|\d{1,2}\.\s+\S|chapter\s+\d+|[IVX]{1,4}\.\s+\S)/iu;
const BULLET = /^(?:[-*•·▪◦‣]|\d{1,2}[.)]|[①-⑳]|[가-힣][.)])\s*/u;

/**
 * 쪽 단위 텍스트 → 정리된 본문.
 * - 쪽 번호만 있는 줄, 구매자·저작권 안내, 여러 쪽에 반복되는 짧은 머리말/꼬리말(전체 쪽의 1/4 이상)을 지운다.
 * - "• 항목" 이 줄로 끊긴 뒤 이어지는 짧은 줄은 같은 항목으로 붙인다(글머리 기호만 있는 줄 포함).
 * - 제목처럼 보이는 줄(■ ·※ · 1. · 제1장 · # …) 앞에 빈 줄을 넣어 목차 생성이 쓸 문단 경계를 만든다.
 * 본문 문장은 바꾸지 않는다(단어 안의 줄바꿈까지 되돌리지는 않는다).
 */
export function cleanPdfPages(pages: string[]): string {
  const split = pages.map((page) => page.split("\n").map((line) => line.replace(/\s+/g, " ").trim()));
  const counts = new Map<string, number>();
  for (const lines of split) for (const line of new Set(lines.filter((l) => l && l.length <= 40))) counts.set(line, (counts.get(line) ?? 0) + 1);
  const repeated = new Set([...counts].filter(([, n]) => n >= 3 && n >= Math.ceil(split.length / 4)).map(([line]) => line));
  const out: string[] = [];
  for (const lines of split) {
    const kept: string[] = [];
    const body = lines.filter((line) => line && !PAGE_MARK.test(line) && !BOILERPLATE.test(line) && !repeated.has(line));
    for (const [index, line] of body.entries()) {
      const prev = kept.at(-1);
      // 글머리 기호만 남은 줄 뒤에 내용이 오면 한 항목으로
      if (prev !== undefined && /^[-*•·▪◦‣]$/u.test(prev)) { kept[kept.length - 1] = `${prev} ${line}`; continue; }
      // 제목 줄: 제목 기호로 시작하거나, 글머리 항목 바로 앞에 오는 짧은 줄(문장부호 없이 끝나고, 앞줄이 항목이거나 문장 끝)
      const next = body[index + 1];
      const titleBeforeList = line.length <= 40 && !BULLET.test(line) && !/[.!?。,:;]$/u.test(line)
        && next !== undefined && BULLET.test(next)
        && (prev === undefined || BULLET.test(prev) || /[.!?。]$/u.test(prev));
      const heading = (HEADING.test(line) && !BULLET.test(line)) || titleBeforeList;
      if (heading && kept.length) kept.push("");
      kept.push(line);
    }
    const page = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (page) out.push(page);
  }
  return out.join("\n\n");
}

export function safeFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  return base.replace(/[\u0000-\u001f]/g, "").slice(0, 120) || "file";
}

type PdfParseModule = typeof import("pdf-parse");

/**
 * pdf-parse(pdf.js) 는 webpack 번들에 들어가면 "Object.defineProperty called on non-object" 로 깨지고,
 * `import { createRequire } from "module"` 도 webpack 이 정적으로 가로챈다.
 * next.config 의 serverExternalPackages(A 소유) 없이도 동작하도록, 번들러가 볼 수 없는 경로로 Node 의 진짜
 * require 를 얻어 프로젝트 루트 기준으로 CJS 빌드를 직접 로드한다.
 * (A 가 next.config.ts 에 `serverExternalPackages: ["pdf-parse"]` 를 넣으면 이 우회는 없어도 된다.)
 */
let pdfModule: PdfParseModule | null = null;
function loadPdfParse(): PdfParseModule {
  if (!pdfModule) {
    const proc = process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown };
    const nodeModule = (
      typeof proc.getBuiltinModule === "function"
        ? proc.getBuiltinModule("node:module")
        : (0, eval)("require")("node:module")
    ) as typeof import("node:module");
    const requireFromRoot = nodeModule.createRequire(resolve(process.cwd(), "package.json"));
    pdfModule = requireFromRoot("pdf-parse") as PdfParseModule;
  }
  return pdfModule;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = loadPdfParse();
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    // pdf-parse v2 의 result.text 에는 "-- 1 of N --" 페이지 구분선이 끼어 있다 → 페이지 텍스트만 이어 붙인다.
    const pages = (result.pages ?? []).map((p) => (p.text ?? "").trim()).filter(Boolean);
    return pages.length ? cleanPdfPages(pages) : (result.text ?? "");
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function ingestFile(file: File): Promise<IngestedSource> {
  const fileName = safeFileName(file.name || "file");
  const kind = detectKind(fileName, file.type);
  if (!kind) throw validation(`지원하지 않는 파일 형식입니다 (md/txt/pdf 만 가능): ${fileName}`);
  if (file.size > MAX_FILE_BYTES) throw validation(`파일이 10MB 를 넘습니다: ${fileName}`);
  if (file.size === 0) throw validation(`빈 파일입니다: ${fileName}`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  if (kind === "PDF") {
    try {
      text = await extractPdfText(bytes);
    } catch (err) {
      console.error("[ingest] pdf parse failed", fileName, err);
      throw validation(`PDF 를 읽을 수 없습니다: ${fileName}`);
    }
  } else {
    text = new TextDecoder("utf-8").decode(bytes);
  }
  text = normalizeText(text);
  if (text.length < MIN_TEXT_CHARS) throw validation(`텍스트를 읽을 수 없는 파일입니다: ${fileName}`);
  return { kind, fileName, text, charCount: text.length };
}

/** multipart 의 files[] / files 둘 다 받는다. 파일이 없거나 5개 초과면 400. */
export function pickFiles(fd: FormData): File[] {
  const files = [...fd.getAll("files[]"), ...fd.getAll("files"), ...fd.getAll("file")].filter(
    (v): v is File => typeof v === "object" && v !== null && typeof (v as File).arrayBuffer === "function",
  );
  if (files.length === 0) throw validation("파일을 1개 이상 올려주세요 (md/txt/pdf).");
  if (files.length > MAX_FILES) throw validation(`파일은 최대 ${MAX_FILES}개까지 올릴 수 있습니다.`);
  return files;
}

export async function ingestFiles(files: File[]): Promise<IngestedSource[]> {
  const out: IngestedSource[] = [];
  for (const f of files) out.push(await ingestFile(f));
  return out;
}
