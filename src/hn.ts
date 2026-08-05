/** Hacker News (Algolia Search API — 무료, 키 불필요) */

export interface HnStory {
  id: string;
  title: string;
  url?: string;
  domain?: string;
  points: number;
  comments: number;
}

/** 최근 days일 내 고득점 스토리 (주간 다이제스트용) */
export async function fetchWeeklyTop(
  days = 7,
  minPoints = 150,
  limit = 15,
): Promise<HnStory[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const params = new URLSearchParams({
    tags: "story",
    numericFilters: `points>${minPoints},created_at_i>${since}`,
    hitsPerPage: "30",
  });
  const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`);
  if (!res.ok) throw new Error(`HN Algolia ${res.status}`);
  const json = (await res.json()) as { hits: any[] };
  return json.hits
    .map((h): HnStory => ({
      id: `hn:${h.objectID}`,
      title: String(h.title ?? ""),
      url: h.url ?? undefined,
      domain: h.url ? safeHost(h.url) : "news.ycombinator.com",
      points: h.points ?? 0,
      comments: h.num_comments ?? 0,
    }))
    .filter((h) => h.title)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

const unescapeHtml = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export interface PageMeta {
  summary?: string;
  /** og:image URL (커버 백드롭용) */
  image?: string;
}

/** 기사 페이지의 meta description·og:image 추출 — payload/커버 보강용. 실패는 조용히 빈 객체. */
export async function fetchPageMeta(url: string, timeoutMs = 6000): Promise<PageMeta> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "ani-cards/0.1" },
    });
    if (!res.ok) return {};
    if (!(res.headers.get("content-type") ?? "").includes("html")) return {};
    const html = (await res.text()).slice(0, 200_000);
    const pick = (prop: string, attr: "property" | "name") =>
      html.match(new RegExp(`<meta[^>]+${attr}=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${prop}["']`, "i"))?.[1];
    const desc = pick("og:description", "property") ?? pick("description", "name");
    const image = pick("og:image", "property");
    const summary = desc ? unescapeHtml(desc).trim().slice(0, 400) : undefined;
    return {
      summary: summary || undefined,
      image: image && /^https?:\/\//.test(image) ? unescapeHtml(image) : undefined,
    };
  } catch {
    return {};
  }
}
