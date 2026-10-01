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

/** 줄바꿈 정규화, 널 문자 제거, 3줄 이상 빈 줄 → 2줄, 앞뒤 공백 제거 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/﻿/g, "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    return result.text ?? "";
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
