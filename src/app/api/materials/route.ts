// [C] POST /api/materials (multipart) → {materialId, status:"PENDING", sources[]} / GET /api/materials → 목록
import type { MaterialCreateResponse, MaterialListItemDto } from "@/contracts/types";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, validation, withApi } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { ingestFiles, pickFiles } from "@/lib/server/ingest";
import { toMaterialListItem, toSourceDto } from "@/lib/server/material-dto";
import { parseDateOnly } from "@/lib/server/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // PDF 동기 파싱 여유

const COURSE_NAME_MAX = 50;

export const POST = withApi(async (req) => {
  const user = await requireUser(req);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    throw validation("multipart/form-data 형식으로 보내주세요 (files[], courseName, examDate?).");
  }

  const courseName = String(fd.get("courseName") ?? "").trim();
  if (!courseName) throw validation("과목명을 입력해 주세요.");
  if (courseName.length > COURSE_NAME_MAX) throw validation(`과목명은 ${COURSE_NAME_MAX}자 이하여야 합니다.`);

  const examDateRaw = fd.get("examDate");
  const examDateStr = typeof examDateRaw === "string" ? examDateRaw.trim() : "";
  const examDate = examDateStr ? parseDateOnly(examDateStr) : null;
  if (examDateStr && !examDate) throw validation("시험일은 YYYY-MM-DD 형식이어야 합니다.");

  const files = pickFiles(fd);
  const ingested = await ingestFiles(files);

  const material = await db.material.create({
    data: {
      id: newId("mat"),
      userId: user.userId,
      courseName,
      examDate,
      title: "새 자료",
      status: "PENDING",
      sources: {
        create: ingested.map((s) => ({
          id: newId("src"),
          kind: s.kind,
          fileName: s.fileName,
          text: s.text,
          charCount: s.charCount,
        })),
      },
    },
    include: { sources: { select: { id: true, kind: true, fileName: true, charCount: true } } },
  });

  const body: MaterialCreateResponse = {
    materialId: material.id,
    status: "PENDING",
    sources: material.sources.map(toSourceDto),
  };
  return json(body, 201);
});

export const GET = withApi(async (req) => {
  const user = await requireUser(req);
  const materials = await db.material.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    include: { chapters: { select: { taughtAt: true } } },
  });
  const body: MaterialListItemDto[] = materials.map(toMaterialListItem);
  return json(body);
});
