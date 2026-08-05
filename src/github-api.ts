/** GitHub Search API — 최근 생성 후 스타 급상승 리포 (공식 API, 무인증 가능) */

export interface RisingRepo {
  id: string; // "gh:owner/name"
  fullName: string;
  name: string;
  description?: string;
  stars: number;
  language?: string;
  url: string;
  topics: string[];
}

export async function fetchRisingRepos(
  days = 21,
  minStars = 200,
  limit = 12,
): Promise<RisingRepo[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const q = `created:>${since} stars:>${minStars}`;
  const params = new URLSearchParams({ q, sort: "stars", order: "desc", per_page: String(limit) });
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ani-cards/0.1",
  };
  // Actions에서는 rate limit 여유를 위해 기본 토큰 사용(없어도 동작)
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/search/repositories?${params}`, { headers });
  if (!res.ok) throw new Error(`GitHub Search ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { items: any[] };
  return json.items.map((r): RisingRepo => ({
    id: `gh:${r.full_name}`,
    fullName: r.full_name,
    name: r.name,
    description: r.description ?? undefined,
    stars: r.stargazers_count ?? 0,
    language: r.language ?? undefined,
    url: r.html_url,
    topics: r.topics ?? [],
  }));
}

/** README 도입부 발췌 — repos 카드 body 재료 (description 한 줄로는 빈약). 실패는 조용히 undefined. */
export async function fetchReadmeExcerpt(fullName: string, maxChars = 500): Promise<string | undefined> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "ani-cards/0.1",
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return undefined;
    const raw = await res.text();
    const text = raw
      .split("\n")
      .filter((l) => !/^\s*(#|!\[|\[!\[|<|---|\||```)/.test(l)) // 제목·뱃지·HTML·표·코드펜스 라인 제외
      .join(" ")
      .replace(/<[^>]+>/g, " ") // 인라인 HTML 태그 제거
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 링크는 텍스트만
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return text ? text.slice(0, maxChars) : undefined;
  } catch {
    return undefined;
  }
}
