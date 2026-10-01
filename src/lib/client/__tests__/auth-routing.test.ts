import assert from "node:assert/strict";
import { test } from "node:test";
import { onboardingRedirect } from "../auth-routing";

test("ordinary navigation never opens orientation, including accounts that left it unfinished", () => {
  for (const onboardingCompleted of [false, true]) {
    for (const path of ["/", "/new", "/mypage", "/materials/old", "/session/old/teach", "/sessions", "/wrong-notes", "/album", "/map"]) {
      assert.equal(onboardingRedirect({ onboardingCompleted }, path), null);
      assert.equal(onboardingRedirect({ onboardingCompleted }, path, "replay"), null);
    }
  }
});

test("signup can open orientation only before completion; MyPage replay remains available to both states", () => {
  assert.equal(onboardingRedirect({ onboardingCompleted: false }, "/onboarding", "signup"), null);
  assert.equal(onboardingRedirect({ onboardingCompleted: true }, "/onboarding", "signup"), "/");
  for (const onboardingCompleted of [false, true]) {
    assert.equal(onboardingRedirect({ onboardingCompleted }, "/onboarding", "replay"), null);
  }
});

test("bare or unknown onboarding URLs return home instead of showing an unsolicited guide", () => {
  for (const onboardingCompleted of [false, true]) {
    for (const mode of [null, "", "unknown"]) {
      assert.equal(onboardingRedirect({ onboardingCompleted }, "/onboarding", mode), "/");
    }
  }
});
