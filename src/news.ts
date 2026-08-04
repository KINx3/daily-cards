import { XMLParser } from "fast-xml-parser";

const FEED = "https://www.animenewsnetwork.com/newsfeed/rss.xml";

export interface NewsItem {
  guid: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  category?: string;
}

/** ANN RSS에서 최근 days일 뉴스만. writer가 이 중 5건을 고른다. */
export async function fetchRecentNews(days = 7, limit = 15): Promise<NewsItem[]> {
  const res = await fetch(FEED, { headers: { "User-Agent": "ani-cards/0.1" } });
  if (!res.ok) throw new Error(`ANN RSS ${res.status}`);
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const items: any[] = doc?.rss?.channel?.item ?? [];
  const cutoff = Date.now() - days * 86400_000;

  return items
    .map((it): NewsItem => ({
      guid: String(it.guid?.["#text"] ?? it.guid ?? it.link ?? it.title),
      title: String(it.title ?? ""),
      link: String(it.link ?? ""),
      description: String(it.description ?? "").replace(/<[^>]+>/g, "").slice(0, 400),
      pubDate: String(it.pubDate ?? ""),
      category: it.category ? String(Array.isArray(it.category) ? it.category[0] : it.category) : undefined,
    }))
    .filter((it) => it.title && !Number.isNaN(Date.parse(it.pubDate)))
    .filter((it) => Date.parse(it.pubDate) >= cutoff)
    // ANN 카테고리: Anime / Manga / Games / Korean / ... — 애니 계정이므로 Anime 위주
    .filter((it) => !it.category || /^(anime|korean)$/i.test(it.category))
    .slice(0, limit);
}
