import { readFile, writeFile } from "node:fs/promises";
import type { LedgerViews } from "./topics/types.js";
import type { PublishMode } from "./types.js";

export interface LedgerEntry {
  date: string;
  type: string;
  mode: PublishMode;
  igMediaId: string | null;
  /** dedup 키 목록 (작품 id·인용 id·뉴스 guid 등 — 토픽이 의미 부여) */
  featured: string[];
  images: string[];
}

const ledgerPath = (topicId: string) => `data/${topicId}/posts.json`;

export async function loadLedger(topicId: string): Promise<LedgerEntry[]> {
  try {
    return JSON.parse(await readFile(ledgerPath(topicId), "utf8")) as LedgerEntry[];
  } catch {
    return [];
  }
}

export async function appendLedger(topicId: string, entry: LedgerEntry): Promise<void> {
  const ledger = await loadLedger(topicId);
  ledger.push(entry);
  await writeFile(ledgerPath(topicId), JSON.stringify(ledger, null, 2) + "\n");
}

export function findEntry(ledger: LedgerEntry[], date: string): LedgerEntry | undefined {
  return ledger.find((e) => e.date === date);
}

/** 발행 완료 후 igMediaId 기록 (publish 단계) */
export async function setIgMediaId(
  topicId: string,
  date: string,
  igMediaId: string,
): Promise<void> {
  const ledger = await loadLedger(topicId);
  const entry = findEntry(ledger, date);
  if (!entry) throw new Error(`[${topicId}] ledger에 ${date} 항목이 없습니다.`);
  entry.igMediaId = igMediaId;
  await writeFile(ledgerPath(topicId), JSON.stringify(ledger, null, 2) + "\n");
}

export function ledgerViews(ledger: LedgerEntry[], recentDays = 30): LedgerViews {
  const cutoff = Date.now() - recentDays * 86400_000;
  const recent = new Set<string>();
  const all = new Set<string>();
  for (const e of ledger) {
    for (const id of e.featured) {
      all.add(id);
      if (Date.parse(e.date) >= cutoff) recent.add(id);
    }
  }
  return { recent, all };
}
