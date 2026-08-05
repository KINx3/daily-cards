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

/** 기사 페이지의 og:description/meta description 추출 — writer payload 보강용. 실패는 조용히 undefined. */
export async function fetchPageSummary(url: string, timeoutMs = 6000): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "ani-cards/0.1" },
    });
    if (!res.ok) return undefined;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return undefined;
    const html = (await res.text()).slice(0, 200_000);
    const m =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ??
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const text = m?.[1] ? unescapeHtml(m[1]).trim() : undefined;
    return text ? text.slice(0, 400) : undefined;
  } catch {
    return undefined;
  }
}
