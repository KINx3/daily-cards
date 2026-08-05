import {
  downloadCover,
  downloadCovers,
  fetchAiringSchedule,
  fetchByIds,
  fetchSeasonal,
  fetchTrending,
  displayTitle,
  type AniMedia,
} from "../anilist.js";
import { loadBank } from "../banks.js";
import { fetchPageMeta } from "../hn.js";
import { fetchRecentNews } from "../news.js";
import type { PostDraft, Slide } from "../types.js";
import type { DayPlan, LedgerViews, Prepared, Topic } from "./types.js";

interface AniQuote {
  id: string;
  quote: string;
  character: string;
  workKo: string;
  workEn?: string;
  anilistId: number;
  verified: boolean;
}

interface AniClassic {
  anilistId: number;
  titleKo: string;
  themes: string[];
  note?: string;
}

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

const mediaKey = (id: number) => `m${id}`;

/** AniList 시즌: 1-3 WINTER / 4-6 SPRING / 7-9 SUMMER / 10-12 FALL */
function currentSeason(dateISO: string): { season: string; seasonYear: number } {
  const [y, m] = dateISO.split("-").map(Number);
  const season = m <= 3 ? "WINTER" : m <= 6 ? "SPRING" : m <= 9 ? "SUMMER" : "FALL";
  return { season, seasonYear: y };
}

/** 1/4/7/10월 첫 금요일 → 분기 신작 라인업 스페셜 */
function isQuarterFirstFriday(plan: DayPlan): boolean {
  const [, m, d] = plan.dateISO.split("-").map(Number);
  return plan.weekday === 5 && [1, 4, 7, 10].includes(m) && d <= 7;
}

/** 다음 주 월~일의 KST 자정 Unix 초 범위 */
function nextWeekRangeKST(dateISO: string): { startSec: number; endSec: number } {
  const [y, m, d] = dateISO.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  const daysToNextMon = ((8 - base.getUTCDay()) % 7) || 7;
  const monday = new Date(Date.UTC(y, m - 1, d + daysToNextMon));
  const startSec = monday.getTime() / 1000 - 9 * 3600; // KST 자정 = UTC 전날 15:00
  return { startSec, endSec: startSec + 7 * 86400 };
}

async function prepare(plan: DayPlan, views: LedgerViews): Promise<Prepared> {
  switch (plan.type) {
    case "trending": {
      const all = await fetchTrending(12);
      const picked = all.filter((m) => !views.recent.has(mediaKey(m.id))).slice(0, 5);
      const list = picked.length >= 5 ? picked : all.slice(0, 5);
      return {
        payload: { items: list.map((m, i) => mediaPayload(m, { rank: i + 1 })) },
        images: await downloadCovers(list),
        featured: list.map((m) => mediaKey(m.id)),
      };
    }

    case "seasonal": {
      const special = isQuarterFirstFriday(plan);
      const { season, seasonYear } = currentSeason(plan.dateISO);
      const all = await fetchSeasonal(season, seasonYear);
      const fresh = all.filter((m) => !views.recent.has(mediaKey(m.id)));
      const list = special
        ? (fresh.length >= 5 ? fresh : all).slice(0, 6)
        : (fresh.length >= 1 ? fresh : all).slice(0, 1);
      return {
        payload: {
          season,
          seasonYear,
          special,
          items: list.map((m, i) => mediaPayload(m, { rank: i + 1 })),
        },
        images: await downloadCovers(list),
        featured: list.map((m) => mediaKey(m.id)),
      };
    }

    case "classic": {
      const classics = await loadBank<AniClassic>("ani", "classics.json");
      const pool = classics.filter((c) => !views.recent.has(mediaKey(c.anilistId)));
      const source = pool.length >= 3 ? pool : classics;
      const picked = [...source].sort(() => Math.random() - 0.5).slice(0, 3);
      const media = await fetchByIds(picked.map((c) => c.anilistId));
      const byId = new Map(media.map((m) => [m.id, m]));
      return {
        payload: {
          items: picked.map((c) => ({
            ...(byId.get(c.anilistId)
              ? mediaPayload(byId.get(c.anilistId)!)
              : { anilistId: c.anilistId, imageKey: mediaKey(c.anilistId) }),
            titleKo: c.titleKo, // 큐레이션 한국어 제목 — writer는 이걸 그대로 사용
            themes: c.themes,
            note: c.note,
          })),
        },
        images: await downloadCovers(media),
        featured: picked.map((c) => mediaKey(c.anilistId)),
      };
    }

    case "quote": {
      const quotes = await loadBank<AniQuote>("ani", "quotes.json");
      const unused = quotes.filter((q) => !views.all.has(q.id));
      if (unused.length === 0) throw new Error("ani quotes 뱅크가 소진되었습니다.");
      const verified = unused.filter((q) => q.verified);
      const needsReview = verified.length === 0;
      if (needsReview) {
        console.warn("⚠️ 검수된 명대사가 없어 미검수 인용 사용 — 리뷰 모드 강제");
      }
      const src = needsReview ? unused : verified;
      const quote = src[Math.floor(Math.random() * src.length)];
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
        images: cover ? { [mediaKey(quote.anilistId)]: cover } : {},
        featured: [quote.id, mediaKey(quote.anilistId)],
        quoteOverride: { body: quote.quote, heading: quote.character, subheading: quote.workKo },
        forceReview: needsReview,
      };
    }

    case "news": {
      const items = (await fetchRecentNews()).filter((n) => !views.all.has(n.guid));
      if (items.length < 3) throw new Error("이번 주 새 뉴스가 3건 미만입니다.");
      // 커버 백드롭용 og:image — 상위 5건 기사에서 첫 성공만
      const metas = await Promise.all(items.slice(0, 5).map((n) => fetchPageMeta(n.link)));
      const coverUri = await downloadCover(metas.find((m) => m.image)?.image);
      return {
        payload: {
          coverImageKey: coverUri ? "newscover" : undefined,
          candidates: items.map((n) => ({
            guid: n.guid,
            title: n.title,
            description: n.description,
            pubDate: n.pubDate,
          })),
        },
        images: coverUri ? { newscover: coverUri } : {},
        featured: items.map((n) => n.guid), // 후보로 소비된 뉴스는 재등장 금지
      };
    }

    case "schedule": {
      const { startSec, endSec } = nextWeekRangeKST(plan.dateISO);
      const slots = await fetchAiringSchedule(startSec, endSec);
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
        featured: [],
      };
    }

    default:
      throw new Error(`[ani] 알 수 없는 타입: ${plan.type}`);
  }
}

function fixture(plan: DayPlan, prepared: Prepared): PostDraft {
  const p = prepared.payload as any;
  const slides: Slide[] = [];
  const title = (it: any) => it.titleKo ?? it.titleEnglish ?? it.titleRomaji ?? `#${it.anilistId}`;
  const meta = (it: any) =>
    [it.format, it.episodes ? `${it.episodes}화` : null, it.studio, it.score ? `평점 ${it.score}` : null]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 68);

  switch (plan.type) {
    case "trending":
    case "seasonal":
    case "classic": {
      const items: any[] = p.items;
      const label =
        plan.type === "trending" ? "주간 트렌딩" : plan.type === "classic" ? "명작 추천" : "이번 분기 신작";
      slides.push({
        kind: "cover",
        badge: "FIXTURE",
        heading: `${label}\n카드뉴스 테스트`,
        subheading: `${plan.dateLabel} 기준`,
        body: "이번 카드에서 소개할\n작품들을 담았습니다.",
        imageKey: items[0]?.imageKey,
      });
      for (const [i, it] of items.entries()) {
        slides.push({
          kind: "item",
          badge: plan.type === "trending" ? `${i + 1}위` : undefined,
          heading: String(title(it)).slice(0, 46),
          subheading: it.titleKo ? (it.titleEnglish ?? it.titleRomaji)?.slice(0, 68) : undefined,
          meta: meta(it),
          body: it.genres?.length ? it.genres.join(" · ") : "지금 주목받는 작품",
          imageKey: it.imageKey,
        });
      }
      break;
    }
    case "quote": {
      slides.push(
        { kind: "cover", badge: "오늘의 명대사", heading: "한 문장이\n오래 남을 때", subheading: p.workKo, body: "작품 속 한 문장을\n오늘의 카드로 전합니다.", imageKey: p.media?.imageKey },
        { kind: "quote", heading: p.character, subheading: p.workKo, body: p.quote, imageKey: p.media?.imageKey },
        {
          kind: "item",
          heading: p.workKo,
          subheading: p.media?.titleRomaji,
          meta: p.media ? meta(p.media) : undefined,
          body: p.media?.genres?.length ? p.media.genres.join(" · ") : "오늘의 명대사 출전작",
          imageKey: p.media?.imageKey,
        },
      );
      break;
    }
    case "news": {
      slides.push({ kind: "cover", badge: "WEEKLY NEWS", heading: "이번 주\n애니 뉴스 다이제스트", subheading: `${plan.dateLabel} 기준`, body: "이번 주 애니 소식을\n간추렸습니다.", imageKey: p.coverImageKey });
      for (const [i, n] of (p.candidates as any[]).slice(0, 5).entries()) {
        slides.push({
          kind: "news",
          badge: `NEWS ${String(i + 1).padStart(2, "0")}`,
          heading: String(n.title).slice(0, 46),
          body: String(n.description).slice(0, 210),
          meta: "Anime News Network",
        });
      }
      break;
    }
    case "schedule": {
      slides.push({ kind: "cover", badge: "NEXT WEEK", heading: "다음 주\n방영 일정", subheading: "인기작 기준", body: "다음 주 방영작을\n요일별로 정리했습니다." });
      for (const day of (p.days as any[]).slice(0, 7)) {
        const m = String(day.label).match(/^(.*?)\s*([가-힣]+요일)$/);
        slides.push({
          kind: "schedule",
          heading: m ? m[2] : day.label,
          subheading: m ? m[1] : undefined,
          body: day.titles
            .slice(0, 4)
            .map((t: any) => `${String(t.title).slice(0, 24)} ${t.episode}화`)
            .join("\n"),
        });
      }
      break;
    }
  }

  slides.push({ kind: "outro", heading: "매일 저녁 6시,\n애니 소식을 카드로", body: "픽스처 모드로 생성된 테스트 초안입니다." });
  return {
    title: `[fixture] ${plan.type} ${plan.dateISO}`,
    slides: slides.slice(0, 9),
    caption: `[fixture] ${plan.type} 파이프라인 테스트 초안입니다.`,
    hashtags: ["애니", "애니추천", "카드뉴스", "애니메이션", "애니뉴스", "오늘의애니", "만화", "otaku"],
  };
}

export const aniTopic: Topic = {
  id: "ani",
  defaultBrand: "ANI·CARDS",
  types: ["trending", "classic", "news", "quote", "seasonal", "schedule"],
  calendar: {
    1: "trending", // 월: 주간 인기 TOP 5
    2: "classic", //  화: 명작 추천
    3: "news", //     수: 주간 애니 뉴스 다이제스트
    4: "quote", //    목: 명대사 카드
    5: "seasonal", // 금: 신작 스포트라이트 (분기 첫 금요일은 라인업 스페셜)
    6: "classic", //  토: 정주행 추천
    0: "schedule", // 일: 다음주 방영 일정
  },
  typeLabels: {
    trending: "주간 인기",
    classic: "명작 추천",
    news: "애니 뉴스",
    quote: "명대사",
    seasonal: "신작",
    schedule: "방영 일정",
  },
  modeOverrides: { news: "review" },
  attribution:
    "이미지: 각 작품 공식 커버 아트 ⓒ 해당 작품 제작위원회 (via AniList)\n권리자 요청 시 즉시 삭제합니다.",
  theme: {
    accent: "#818cf8",
    accentSoft: "#a5b4fc",
    accent2: "#c084fc",
    highlight: "#facc15",
    gradTitle: "linear-gradient(100deg, #ffffff 20%, #818cf8 60%, #c084fc 90%)",
    glowA: "rgba(124, 58, 237, 0.22)",
    glowB: "rgba(37, 99, 235, 0.16)",
    badgeGrad: "linear-gradient(120deg, #facc15, #fb923c)",
  },
  writerSystemExtra: `토픽: 애니메이션 정보 계정.
- 작품 제목: 입력에 titleKo가 있으면 반드시 그대로 쓴다. 없으면 네가 확신하는 한국 정식 발매 제목만 쓰고, 불확실하면 titleEnglish 또는 titleRomaji를 그대로 쓴다. 제목을 창작·직역하지 않는다.
- 톤: 팬심 있는 에디터. 과장·스포일러·이모지 남용 금지.`,
  typeGuides: {
    trending: `구성: cover(작품명 나열 금지 — "이번 주 다들 뭐 보나" 같은 궁금증 후킹, 1위 작품의 imageKey) → rank 순서대로 item 5장(badge="N위", 각 항목의 imageKey) → outro(저장 유도).
item.body는 그 작품이 지금 뜨는 이유나 한 줄 소개.`,
    seasonal: `special=false: cover(작품의 imageKey — 제목 대신 "이번 분기 이거 하나는 봐야 한다"류 후킹) → item(작품 개요) → item(badge="관전 포인트", 같은 imageKey, body에 이 작품을 봐야 할 이유) → outro(저장 유도).
special=true(분기 라인업): cover → 기대작 item 5~6장(badge="기대작 N") → outro(저장 유도).`,
    classic: `구성: cover(작품명 노출 금지 — 세 작품을 묶는 테마·감정으로 후킹, 예: "밤새 정주행하고\\n후회 없던 작품들") → item 3장(titleKo 그대로, body는 themes/note를 살린 2~3줄 추천 이유) → outro(저장 유도).`,
    quote: `구성: cover(media의 imageKey — 인물·작품명 노출 금지, 문장이 필요한 상황으로 후킹) → quote 슬라이드(kind="quote", heading=character, subheading=workKo, body=quote 원문 그대로, imageKey=media의 것) → item(작품 한 줄 소개) → outro(저장 유도).`,
    news: `구성: cover(입력에 coverImageKey가 있으면 imageKey에 그 값을 그대로 — heading은 오늘 소식 중 가장 큰 하나를 팬이 궁금해질 한 줄로) → news 5장(badge="NEWS 01"~"NEWS 05", heading은 한국어 헤드라인 ≤ 2줄, body는 2문장 요약, meta="Anime News Network") → outro(저장 유도).
candidates에서 한국 팬에게 파급력 큰 5건을 고른다. 확실하지 않은 내용은 다루지 않는다.`,
    schedule: `구성: cover → schedule 슬라이드(요일당 1장, heading="월요일" 같은 요일, subheading="8월 10일" 같은 날짜, body는 "작품명 N화"를 줄바꿈으로 나열, 요일당 최대 4작품) → outro.
방영작 없는 요일은 생략. 전체 슬라이드 9장 이하.`,
  },
  prepare,
  fixture,
};
