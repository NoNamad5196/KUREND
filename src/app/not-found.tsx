import Link from "next/link";

export default function NotFound() {
  return <section className="mx-auto flex min-h-[55vh] max-w-3xl flex-col justify-center py-12">
    <p className="editorial-label text-muted">404 / PAGE NOT FOUND</p>
    <h1 className="display-title mt-6">찾으시는 페이지가<br />없어요<span className="text-primary">.</span></h1>
    <p className="mt-6 max-w-md text-sm leading-7 text-muted">주소가 바뀌었거나 삭제된 페이지예요. 홈에서 공부하던 자료를 다시 찾아보세요.</p>
    <Link href="/" className="k-button k-button-primary mt-8 inline-flex w-fit items-center gap-10 px-5 py-3 text-sm">홈으로 돌아가기 <span aria-hidden="true">↗</span></Link>
  </section>;
}
