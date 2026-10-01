/** Fixtures for local development and tests; never available in production. */
export const DEMO_USER_IDS = ["usr_demo1", "usr_demo2", "usr_demo3"];

export function demoAuthEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

export function isDemoUserId(userId: string): boolean {
  return DEMO_USER_IDS.includes(userId);
}
