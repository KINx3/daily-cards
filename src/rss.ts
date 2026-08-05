import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

/** 여러 RSS 피드를 병합해 최근 days일 항목만 (날짜 내림차순) */
export async function fetchFeeds(
  feeds: { url: string; source: string }[],
  days = 7,
  limit = 15,
): Promise<FeedItem[]> {
  const parser = new XMLParser({ ignoreAttributes: false });
  const cutoff = Date.now() - days * 86400_000;
  const all: FeedItem[] = [];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, { headers: { "User-Agent": "ani-cards/0.1" } });
      if (!res.ok) {
        console.warn(`RSS ${feed.source} ${res.status} — skip`);
        continue;
      }
      const doc = parser.parse(await res.text());
      const items: any[] = doc?.rss?.channel?.item ?? [];
      for (const it of items) {
        const item: FeedItem = {
          guid: String(it.guid?.["#text"] ?? it.guid ?? it.link ?? it.title),
          title: String(it.title ?? ""),
          link: String(it.link ?? ""),
          description: String(it.description ?? "").replace(/<[^>]+>/g, "").slice(0, 600),
          pubDate: String(it.pubDate ?? ""),
          source: feed.source,
        };
        if (item.title && !Number.isNaN(Date.parse(item.pubDate)) && Date.parse(item.pubDate) >= cutoff) {
          all.push(item);
        }
      }
    } catch (err) {
      console.warn(`RSS ${feed.source} 실패 — skip:`, err instanceof Error ? err.message : err);
    }
  }

  return all.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate)).slice(0, limit);
}
