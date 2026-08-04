import { readFile, writeFile } from "node:fs/promises";
import type { ContentType, PublishMode } from "./types.js";

const LEDGER_PATH = "data/posts.json";

export interface LedgerEntry {
  date: string;
  type: ContentType;
  mode: PublishMode;
  igMediaId: string | null;
  anilistIds: number[];
  quoteId: string | null;
  newsGuids: string[];
  images: string[];
}

export async function loadLedger(): Promise<LedgerEntry[]> {
  try {
    return JSON.parse(await readFile(LEDGER_PATH, "utf8")) as LedgerEntry[];
  } catch {
    return [];
  }
}

export async function appendLedger(entry: LedgerEntry): Promise<void> {
  const ledger = await loadLedger();
  ledger.push(entry);
  await writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

export function findEntry(ledger: LedgerEntry[], date: string): LedgerEntry | undefined {
  return ledger.find((e) => e.date === date);
}

/** 발행 완료 후 igMediaId 기록 (publish 단계) */
export async function setIgMediaId(date: string, igMediaId: string): Promise<void> {
  const ledger = await loadLedger();
  const entry = findEntry(ledger, date);
  if (!entry) throw new Error(`ledger에 ${date} 항목이 없습니다.`);
  entry.igMediaId = igMediaId;
  await writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

/** 최근 days일 내 피처링된 AniList id (trending/seasonal/classic 중복 방지) */
export function recentAnilistIds(ledger: LedgerEntry[], days = 30): Set<number> {
  const cutoff = Date.now() - days * 86400_000;
  const ids = new Set<number>();
  for (const e of ledger) {
    if (Date.parse(e.date) >= cutoff) for (const id of e.anilistIds) ids.add(id);
  }
  return ids;
}

export function usedQuoteIds(ledger: LedgerEntry[]): Set<string> {
  return new Set(ledger.flatMap((e) => (e.quoteId ? [e.quoteId] : [])));
}

export function usedNewsGuids(ledger: LedgerEntry[]): Set<string> {
  return new Set(ledger.flatMap((e) => e.newsGuids));
}
