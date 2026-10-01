/** [C 소유] §2-3 ID 규칙: nanoid(14) + 접두사 */
import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nano = customAlphabet(alphabet, 14);

export type IdPrefix = "usr" | "mat" | "src" | "chp" | "sess" | "msg" | "exam" | "gap" | "tm";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${nano()}`;
}

/** 시험 문항/답안/채점의 전역 id: `${examId}:${qid}` */
export function examItemId(examId: string, qid: string): string {
  return `${examId}:${qid}`;
}
