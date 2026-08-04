import {
  downloadCover,
  downloadCovers,
  fetchAiringSchedule,
  fetchByIds,
  fetchSeasonal,
  fetchTrending,
  displayTitle,
  type AniMedia,
} from "./anilist.js";
import { fetchRecentNews } from "./news.js";
import type { DayPlan } from "./plan.js";
import { currentSeason, nextWeekRangeKST } from "./plan.js";
import { loadClassics, loadQuotes, pickClassics, pickQuote } from "./quotes.js";
import type { ImageMap } from "./types.js";

/** writer 입력으로 넘길 작품 요약 (imageKey는 여기서 확정 — writer는 창작 금지) */
function mediaPayload(m: AniMedia, extra?: Record<string, unknown>) {
  return {
    imageKey: `m${m.id}`,
    anilistId: m.id,
    titleRomaji: m.title.romaji,
    titleEnglish: m.title.english,
    titleNative: m.title.native,
    score: m.averageScore,
    popularity: m.popularity,
    genres: m.genres?.slice(0, 4),
    episodes: m.episodes,
    format: m.format,
    status: m.status,
    season: m.season,
    seasonYear: m.seasonYear,
    studio: m.studios?.nodes?.[0]?.name,
    ...extra,
  };
}

export interface Prepared {
  /** writer(user turn)에 그대로 직렬화되는 데이터 */
  payload: unknown;
  images: ImageMap;
  anilistIds: number[];
  quoteId: string | null;
  newsGuids: string[];
  /** 명대사 원문 강제 주입용(writer 출력 미신뢰) */
  quoteOverride?: { body: string; heading: string; subheading: string };
  /** 미검수 인용 사용 등 — 리뷰 모드 강제 */
  forceReview?: boolean;
}

export async function prepare(
  plan: DayPlan,
  recentIds: Set<number>,
  usedQuotes: Set<string>,
  usedNews: Set<string>,
): Promise<Prepared> {
  switch (plan.type) {
    case "trending": {
      const all = await fetchTrending(12);
      const picked = all.filter((m) => !recentIds.has(m.id)).slice(0, 5);
      const list = picked.length >= 5 ? picked : all.slice(0, 5); // dedup으로 5개 미만이면 완화
      const images = await downloadCovers(list);
      return {
        payload: { items: list.map((m, i) => mediaPayload(m, { rank: i + 1 })) },
        images,
        anilistIds: list.map((m) => m.id),
        quoteId: null,
        newsGuids: [],
      };
    }

    case "seasonal": {
      const { season, seasonYear } = currentSeason(plan.dateISO);
      const all = await fetchSeasonal(season, seasonYear);
      const fresh = all.filter((m) => !recentIds.has(m.id));
      const list = plan.seasonalSpecial
        ? (fresh.length >= 5 ? fresh : all).slice(0, 6)
        : (fresh.length >= 1 ? fresh : all).slice(0, 1);
      const images = await downloadCovers(list);
      return {
        payload: {
          season,
          seasonYear,
          special: plan.seasonalSpecial,
          items: list.map((m, i) => mediaPayload(m, { rank: i + 1 })),
        },
        images,
        anilistIds: list.map((m) => m.id),
        quoteId: null,
        newsGuids: [],
      };
    }

    case "classic": {
      const classics = await loadClassics();
      const picked = pickClassics(classics, recentIds, 3);
      const media = await fetchByIds(picked.map((c) => c.anilistId));
      const byId = new Map(media.map((m) => [m.id, m]));
      const images = await downloadCovers(media);
      return {
        payload: {
          items: picked.map((c) => ({
            ...(byId.get(c.anilistId) ? mediaPayload(byId.get(c.anilistId)!) : { anilistId: c.anilistId, imageKey: `m${c.anilistId}` }),
            titleKo: c.titleKo, // 큐레이션 한국어 제목 — writer는 이걸 그대로 사용
            themes: c.themes,
            note: c.note,
          })),
        },
        images,
        anilistIds: picked.map((c) => c.anilistId),
        quoteId: null,
        newsGuids: [],
      };
    }

    case "quote": {
      const quotes = await loadQuotes();
      const { quote, needsReview } = pickQuote(quotes, usedQuotes);
      const [media] = await fetchByIds([quote.anilistId]);
      const cover = await downloadCover(media?.coverImage?.extraLarge);
      return {
        payload: {
          quote: quote.quote,
          character: quote.character,
          workKo: quote.workKo,
          workEn: quote.workEn,
          media: media ? mediaPayload(media, { titleKo: quote.workKo }) : null,
        },
        images: cover ? { [`m${quote.anilistId}`]: cover } : {},
        anilistIds: [quote.anilistId],
        quoteId: quote.id,
        newsGuids: [],
        quoteOverride: {
          body: quote.quote,
          heading: quote.character,
          subheading: quote.workKo,
        },
        forceReview: needsReview,
      };
    }

    case "news": {
      const items = (await fetchRecentNews()).filter((n) => !usedNews.has(n.guid));
      if (items.length < 3) throw new Error("이번 주 새 뉴스가 3건 미만입니다.");
      return {
        payload: {
          candidates: items.map((n) => ({
            guid: n.guid,
            title: n.title,
            description: n.description,
            pubDate: n.pubDate,
          })),
        },
        images: {},
        anilistIds: [],
        quoteId: null,
        newsGuids: items.map((n) => n.guid), // 후보로 소비된 뉴스는 재등장 금지
      };
    }

    case "schedule": {
      const { startSec, endSec } = nextWeekRangeKST(plan.dateISO);
      const slots = await fetchAiringSchedule(startSec, endSec);
      // 인기 상위 12개 작품만, KST 요일별 그룹핑
      const topIds = new Set(
        [...new Map(slots.map((s) => [s.media.id, s.media])).values()]
          .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
          .slice(0, 12)
          .map((m) => m.id),
      );
      const dayFmt = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        weekday: "long",
        month: "numeric",
        day: "numeric",
      });
      const days = new Map<string, { title: string; episode: number }[]>();
      for (const s of slots) {
        if (!topIds.has(s.media.id)) continue;
        const label = dayFmt.format(new Date(s.airingAt * 1000)); // "8월 10일 월요일"
        if (!days.has(label)) days.set(label, []);
        days.get(label)!.push({ title: displayTitle(s.media), episode: s.episode });
      }
      return {
        payload: {
          weekOf: plan.dateISO,
          days: [...days.entries()].map(([label, titles]) => ({ label, titles })),
        },
        images: {},
        anilistIds: [],
        quoteId: null,
        newsGuids: [],
      };
    }
  }
}
