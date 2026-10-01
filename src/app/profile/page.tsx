import { redirect } from "next/navigation";

/** 예전 프로필·설정 주소 — 마이페이지(통계·업적·설정·계정)로 합쳤다. */
export default function Page() {
  redirect("/mypage");
}
