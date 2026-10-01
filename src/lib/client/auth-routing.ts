import type { MeDto } from "@/contracts/types";

/** Signup opens orientation explicitly; ordinary navigation never interrupts learning. */
export function onboardingRedirect(me: Pick<MeDto, "onboardingCompleted">, pathname: string, mode: string | null = null): string | null {
  if (pathname !== "/onboarding") return null;
  if (mode === "replay") return null;
  if (mode === "signup" && !me.onboardingCompleted) return null;
  return "/";
}
