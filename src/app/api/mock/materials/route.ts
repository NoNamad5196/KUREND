import type { SourceKind } from "@/contracts/types";
import { currentUser } from "@/mocks/auth";
import { MockError, ok, withMock } from "@/mocks/http";
import { createMaterial, listMaterials } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withMock((req) => ok(listMaterials(currentUser(req))));
export const POST = withMock(async (req) => {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    throw new MockError(400, "VALIDATION", "multipart/form-data 로 보내 주세요.");
  }
  const courseName = String(fd.get("courseName") ?? "").trim();
  if (!courseName) throw new MockError(400, "VALIDATION", "과목명을 입력해 주세요.");
  const examDateRaw = String(fd.get("examDate") ?? "").trim();
  const files = fd.getAll("files[]").concat(fd.getAll("files")).filter((f): f is File => typeof f !== "string");
  if (files.length === 0) throw new MockError(400, "VALIDATION", "파일을 1개 이상 올려 주세요.");
  if (files.length > 5) throw new MockError(400, "VALIDATION", "파일은 최대 5개까지 올릴 수 있습니다.");
  const parsed: Array<{ fileName: string; kind: SourceKind; text: string }> = [];
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) throw new MockError(400, "VALIDATION", `${f.name}: 10MB 이하 파일만 올릴 수 있습니다.`);
    const ext = f.name.split(".").pop()?.toLowerCase();
    const kind: SourceKind = ext === "pdf" ? "PDF" : ext === "txt" ? "TXT" : "MD";
    const text = kind === "PDF" ? `# ${f.name}\n\n(mock) PDF 본문 추출은 실제 서버(C)에서 동작합니다. 이 자리에는 추출된 텍스트가 들어갑니다.` : await f.text();
    if (!text.trim()) throw new MockError(400, "VALIDATION", `${f.name}: 텍스트를 읽을 수 없는 파일입니다.`);
    parsed.push({ fileName: f.name, kind, text });
  }
  return ok(createMaterial(currentUser(req), courseName, examDateRaw || null, parsed));
});
