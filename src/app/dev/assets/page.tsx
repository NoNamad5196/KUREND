import { notFound } from "next/navigation";
import { JuniorAvatar } from "@/components/game/JuniorAvatar";
import sources from "../../../../public/assets/kurend/manifests/sources.json";

export default function AssetPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <div className="space-y-8 pb-12">
    <header><h1 className="text-2xl font-bold">정적 자산 미리보기</h1><p className="mt-2 text-sm text-muted">제공된 캐릭터·차량·배경을 각각 확인하는 개발용 화면입니다. 학습 결과를 만드는 시연이 아닙니다.</p></header>
    <section aria-label="기본 캐릭터" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {(["MALE_EASY", "FEMALE_NORMAL", "KU_HARD"] as const).map(character => <figure key={character} className="flex min-w-0 flex-col items-center justify-end rounded-sm border border-line bg-surface p-5"><JuniorAvatar character={character} size={260} /><figcaption className="mt-4 text-sm">{character === "MALE_EASY" ? "남학생" : character === "FEMALE_NORMAL" ? "여학생" : "KU"} · 기본복</figcaption></figure>)}
    </section>
    <section aria-label="분리 원본 목록" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sources.map(source => <figure key={source.path} className="min-w-0 overflow-hidden rounded-sm border border-line bg-surface">
        <div className="flex h-64 items-center justify-center bg-[#e4e9df] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- inspect the unchanged provided PNG */}
          <img src={source.path} width={source.width} height={source.height} alt={source.original} className="h-full w-full object-contain" />
        </div>
        <figcaption className="break-all p-3 text-xs"><a className="underline" href={source.path}>{source.original}</a><p className="mt-1 text-muted">{source.width} × {source.height} · {source.number === null ? "배경" : source.number <= 16 ? "캐릭터" : source.number <= 18 ? "차량" : "소품"}</p></figcaption>
      </figure>)}
    </section>
  </div>;
}
