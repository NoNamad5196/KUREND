import { loadEnvFile } from "node:process";

/** CLI evals share Next's local .env without replacing explicitly supplied variables. */
export function loadLocalEnvironment(path = ".env"): void {
  try {
    loadEnvFile(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    // The original error may contain file contents; keep credentials out of diagnostics.
    throw new Error("로컬 .env 파일을 읽지 못했습니다. 파일 권한과 형식을 확인해 주세요.");
  }
}
