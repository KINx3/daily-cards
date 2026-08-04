import { readFile } from "node:fs/promises";

export interface QuoteSeed {
  id: string;
  quote: string;
  character: string;
  workKo: string;
  workEn?: string;
  anilistId: number;
  /** 사람이 원문 검수를 마친 것만 true — 검수 전 인용은 리뷰 모드 강제 */
  verified: boolean;
}

export interface ClassicSeed {
  anilistId: number;
  titleKo: string;
  themes: string[];
  note?: string;
}

export async function loadQuotes(): Promise<QuoteSeed[]> {
  return JSON.parse(await readFile("data/quotes.json", "utf8")) as QuoteSeed[];
}

export async function loadClassics(): Promise<ClassicSeed[]> {
  return JSON.parse(await readFile("data/classics.json", "utf8")) as ClassicSeed[];
}

/** 미사용 인용 선택: verified 우선, 없으면 unverified(리뷰 강제 플래그) */
export function pickQuote(
  quotes: QuoteSeed[],
  used: Set<string>,
): { quote: QuoteSeed; needsReview: boolean } {
  const unused = quotes.filter((q) => !used.has(q.id));
  if (unused.length === 0) throw new Error("quotes.json 뱅크가 소진되었습니다. 새 인용을 추가하세요.");
  const verified = unused.filter((q) => q.verified);
  if (verified.length > 0) {
    return { quote: verified[Math.floor(Math.random() * verified.length)], needsReview: false };
  }
  console.warn("⚠️ 검수(verified:true)된 인용이 없어 미검수 인용을 사용합니다 — 리뷰 모드로 강제됩니다.");
  return { quote: unused[Math.floor(Math.random() * unused.length)], needsReview: true };
}

/** 최근 미피처링 명작 n개 선택 */
export function pickClassics(
  classics: ClassicSeed[],
  usedAnilistIds: Set<number>,
  count: number,
): ClassicSeed[] {
  const pool = classics.filter((c) => !usedAnilistIds.has(c.anilistId));
  const source = pool.length >= count ? pool : classics; // 전부 소진되면 순환 허용
  return [...source].sort(() => Math.random() - 0.5).slice(0, count);
}
