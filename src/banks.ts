import { readFile } from "node:fs/promises";

/** data/<topic>/<file> JSON 뱅크 로드 */
export async function loadBank<T>(topicId: string, file: string): Promise<T[]> {
  return JSON.parse(await readFile(`data/${topicId}/${file}`, "utf8")) as T[];
}

/** 미사용 항목 n개 선택 — 소진되면 전체 풀에서 재순환 */
export function pickUnused<T extends { id: string }>(
  bank: T[],
  used: Set<string>,
  count: number,
): T[] {
  const pool = bank.filter((b) => !used.has(b.id));
  const source = pool.length >= count ? pool : bank;
  return [...source].sort(() => Math.random() - 0.5).slice(0, count);
}

export interface VerifiedQuote {
  id: string;
  quote: string;
  /** 화자(캐릭터·인물) */
  by: string;
  /** 출전(작품·저서·연설 등) — 없으면 인물만 표기 */
  source?: string;
  /** 사람이 원문 검수를 마친 것만 true — 검수 전 인용은 리뷰 모드 강제 */
  verified: boolean;
}

/** 인용 선택: 미사용 verified 우선, 없으면 미사용 unverified(리뷰 강제) */
export function pickVerifiedQuote<T extends VerifiedQuote>(
  bank: T[],
  used: Set<string>,
): { quote: T; needsReview: boolean } {
  const unused = bank.filter((q) => !used.has(q.id));
  if (unused.length === 0) {
    throw new Error("인용 뱅크가 소진되었습니다. 새 항목을 추가하세요.");
  }
  const verified = unused.filter((q) => q.verified);
  if (verified.length > 0) {
    return { quote: verified[Math.floor(Math.random() * verified.length)], needsReview: false };
  }
  console.warn("⚠️ 검수(verified:true)된 인용이 없어 미검수 인용을 사용합니다 — 리뷰 모드로 강제됩니다.");
  return { quote: unused[Math.floor(Math.random() * unused.length)], needsReview: true };
}
