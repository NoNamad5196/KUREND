/** mock 목차 생성 (실제는 D). 마크다운 제목(#, ##)으로 나누고, 없으면 문단을 4묶음으로 나눈다. */
import { withMock } from "@/mocks/http";
import { runStream, sleep } from "@/mocks/sse";
import { getMaterialRec, materialSources, setChapters } from "@/mocks/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function split(sourceId: string, text: string) {
  const heads = [...text.matchAll(/^#{1,2}\s+(.+)$/gm)].filter((m) => !/강의노트|^\S+\s*—/.test(m[1]) || text.indexOf(m[0]) > 0);
  const out: Array<{ title: string; points: string[]; sourceId: string; startOffset: number; endOffset: number }> = [];
  const cut = heads.length >= 2 ? heads.map((m) => ({ title: m[1], at: m.index ?? 0 })) : [];
  if (cut.length >= 2) {
    cut.forEach((c, i) => {
      const end = i + 1 < cut.length ? cut[i + 1].at : text.length;
      const body = text.slice(c.at, end);
      const subs = [...body.matchAll(/^#{3,}\s+(?:[\d.]+\s*)?(.+)$/gm)].map((m) => m[1].trim().slice(0, 15));
      out.push({ title: c.title.replace(/^\d+장\.\s*|^[\d.]+\s*/, "").slice(0, 20), points: (subs.length ? subs : ["핵심 개념", "주요 용어"]).slice(0, 4), sourceId, startOffset: c.at, endOffset: end });
    });
  } else {
    const n = 4;
    const size = Math.ceil(text.length / n);
    for (let i = 0; i < n && i * size < text.length; i++) {
      out.push({ title: `${i + 1}부분`, points: ["핵심 개념", "주요 용어"], sourceId, startOffset: i * size, endOffset: Math.min(text.length, (i + 1) * size) });
    }
  }
  return out.filter((c) => c.endOffset - c.startOffset > 40);
}

export const POST = withMock<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const m = getMaterialRec(id);
  const t0 = Date.now();
  return runStream(req, async (s) => {
    s.send("progress", { step: "READING", message: "자료를 읽는 중", elapsedMs: Date.now() - t0 });
    await sleep(700);
    s.send("progress", { step: "SPLITTING", message: "목차로 나누는 중", elapsedMs: Date.now() - t0 });
    await sleep(700);
    const chapters = materialSources(id).flatMap((src) => split(src.sourceId, src.text)).slice(0, 12);
    s.send("progress", { step: "TITLING", message: "제목을 붙이는 중", elapsedMs: Date.now() - t0 });
    await sleep(700);
    const firstTitle = materialSources(id)[0]?.text.match(/^#\s+(.+)$/m)?.[1];
    const title = (firstTitle ?? `${m.courseName} 자료`).replace(/\s*—.*$/, "").slice(0, 20);
    const saved = setChapters(id, title, chapters);
    s.send("chapters", { title, chapters: saved });
  });
});
