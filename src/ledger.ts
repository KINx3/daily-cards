import { readFile, writeFile } from "node:fs/promises";
import type { LedgerViews } from "./topics/types.js";
import type { PublishMode } from "./types.js";

export interface LedgerEntry {
  date: string;
  /** 같은 날 n번째 포스트 (1부터). 슬롯 도입 전 엔트리는 필드가 없음 = 1로 간주 */
  slot?: number;
  type: string;
  mode: PublishMode;
  igMediaId: string | null;
  /** dedup 키 목록 (작품 id·인용 id·뉴스 guid 등 — 토픽이 의미 부여) */
  featured: string[];
  images: string[];
}

export const slotOf = (e: LedgerEntry): number => e.slot ?? 1;

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

export function findEntry(
  ledger: LedgerEntry[],
  date: string,
  slot = 1,
): LedgerEntry | undefined {
  return ledger.find((e) => e.date === date && slotOf(e) === slot);
}

/** 그날 최대 슬롯 번호 (엔트리 없으면 0) */
export function maxSlot(ledger: LedgerEntry[], date: string): number {
  return ledger.reduce((m, e) => (e.date === date ? Math.max(m, slotOf(e)) : m), 0);
}

/** 발행 완료 후 igMediaId 기록 (publish 단계) */
export async function setIgMediaId(
  topicId: string,
  date: string,
  slot: number,
  igMediaId: string,
): Promise<void> {
  const ledger = await loadLedger(topicId);
  const entry = findEntry(ledger, date, slot);
  if (!entry) throw new Error(`[${topicId}] ledger에 ${date} #${slot} 항목이 없습니다.`);
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
