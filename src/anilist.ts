import type { ImageMap } from "./types.js";

const API = "https://graphql.anilist.co";

export interface AniMedia {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage: { extraLarge?: string; color?: string };
  averageScore?: number;
  popularity?: number;
  genres?: string[];
  episodes?: number;
  format?: string;
  status?: string;
  season?: string;
  seasonYear?: number;
  startDate?: { year?: number; month?: number; day?: number };
  nextAiringEpisode?: { airingAt: number; episode: number };
  studios?: { nodes: { name: string }[] };
  siteUrl?: string;
}

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { extraLarge color }
  averageScore
  popularity
  genres
  episodes
  format
  status
  season
  seasonYear
  startDate { year month day }
  nextAiringEpisode { airingAt episode }
  studios(isMain: true) { nodes { name } }
  siteUrl
`;

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429 && attempt === 0) {
      const wait = Number(res.headers.get("retry-after") ?? "60");
      console.warn(`AniList 429 — ${wait}초 대기 후 재시도`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`AniList ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(`AniList GraphQL: ${json.errors[0].message}`);
    return json.data as T;
  }
}

export async function fetchTrending(perPage = 12): Promise<AniMedia[]> {
  const data = await gql<{ Page: { media: AniMedia[] } }>(
    `query ($perPage: Int) {
      Page(perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC, format_in: [TV, TV_SHORT, MOVIE, ONA]) {
          ${MEDIA_FIELDS}
        }
      }
    }`,
    { perPage },
  );
  return data.Page.media;
}

export async function fetchSeasonal(
  season: string,
  seasonYear: number,
  perPage = 15,
): Promise<AniMedia[]> {
  const data = await gql<{ Page: { media: AniMedia[] } }>(
    `query ($season: MediaSeason, $seasonYear: Int, $perPage: Int) {
      Page(perPage: $perPage) {
        media(type: ANIME, season: $season, seasonYear: $seasonYear,
              sort: POPULARITY_DESC, format_in: [TV, TV_SHORT, ONA]) {
          ${MEDIA_FIELDS}
        }
      }
    }`,
    { season, seasonYear, perPage },
  );
  return data.Page.media;
}

export async function fetchByIds(ids: number[]): Promise<AniMedia[]> {
  const data = await gql<{ Page: { media: AniMedia[] } }>(
    `query ($ids: [Int]) {
      Page(perPage: ${ids.length}) {
        media(type: ANIME, id_in: $ids) { ${MEDIA_FIELDS} }
      }
    }`,
    { ids },
  );
  return data.Page.media;
}

export interface AiringSlot {
  airingAt: number;
  episode: number;
  media: AniMedia;
}

export async function fetchAiringSchedule(
  startSec: number,
  endSec: number,
): Promise<AiringSlot[]> {
  const data = await gql<{ Page: { airingSchedules: AiringSlot[] } }>(
    `query ($start: Int, $end: Int) {
      Page(perPage: 50) {
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          airingAt
          episode
          media { ${MEDIA_FIELDS} }
        }
      }
    }`,
    { start: startSec, end: endSec },
  );
  return data.Page.airingSchedules.filter((s) => s.media?.title);
}

/** 커버 이미지를 data URI로 다운로드. 실패 시 undefined(플레이스홀더 렌더). */
export async function downloadCover(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** media 목록의 커버를 내려받아 imageKey(`m<id>`) → dataURI 맵 구성 */
export async function downloadCovers(media: AniMedia[]): Promise<ImageMap> {
  const entries = await Promise.all(
    media.map(async (m) => [`m${m.id}`, await downloadCover(m.coverImage?.extraLarge)] as const),
  );
  return Object.fromEntries(entries.filter(([, v]) => v)) as ImageMap;
}

export function displayTitle(m: AniMedia): string {
  return m.title.english || m.title.romaji || m.title.native || `#${m.id}`;
}
