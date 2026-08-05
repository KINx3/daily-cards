import { downloadCover } from "../anilist.js";
import { loadBank, pickUnused, pickVerifiedQuote, type VerifiedQuote } from "../banks.js";
import type { PostDraft, Slide } from "../types.js";
import type { DayPlan, LedgerViews, Prepared, Topic } from "./types.js";

interface BookSeed {
  id: string;
  titleKo: string;
  author: string;
  tagline: string;
  keyIdeas: string[];
}

interface TopicSeed {
  id: string;
  title: string;
  hint: string;
}

const authorSurname = (author: string) => author.split(/[·,\s]/)[0]?.trim() ?? "";

/** 알라딘 TTB 표지 검색 — ALADIN_TTB_KEY 시크릿이 있을 때만. 고해상 cover 제공. */
async function fetchAladinCover(titleKo: string, author: string): Promise<string | undefined> {
  const key = process.env.ALADIN_TTB_KEY;
  if (!key) return undefined;
  try {
    const params = new URLSearchParams({
      ttbkey: key, Query: titleKo, QueryType: "Title", SearchTarget: "Book",
      output: "js", Version: "20131101", Cover: "Big", MaxResults: "5",
    });
    const res = await fetch(`https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?${params}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as any;
    const items: any[] = json.item ?? [];
    const surname = authorSurname(author);
    const pick = items.find((it) => surname && String(it.author ?? "").includes(surname)) ?? items[0];
    return pick?.cover ? String(pick.cover) : undefined;
  } catch {
    return undefined;
  }
}

/** Google Books 표지 검색 (키 불필요 — 단, 익명 쿼터가 자주 소진되니 폴백 취급). */
async function fetchGoogleBooksCover(titleKo: string, author: string): Promise<string | undefined> {
  try {
    const q = encodeURIComponent(`intitle:"${titleKo}"`);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&country=KR&maxResults=5&printType=books`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return undefined;
    const json = (await res.json()) as any;
    const items: any[] = json.items ?? [];
    const surname = authorSurname(author);
    const withThumb = items.filter((it) => it.volumeInfo?.imageLinks?.thumbnail);
    const pick =
      withThumb.find((it) => surname && (it.volumeInfo.authors ?? []).join(" ").includes(surname)) ??
      withThumb[0];
    const thumb: string | undefined = pick?.volumeInfo?.imageLinks?.thumbnail;
    if (!thumb) return undefined;
    return thumb.replace(/^http:/, "https:").replace("&edge=curl", "");
  } catch {
    return undefined;
  }
}

/** 표지 URL: 알라딘(키 있으면) 우선, Google Books 폴백. 실패는 undefined(타이포 렌더). */
async function fetchBookCoverUrl(titleKo: string, author: string): Promise<string | undefined> {
  return (await fetchAladinCover(titleKo, author)) ?? (await fetchGoogleBooksCover(titleKo, author));
}

async function prepare(plan: DayPlan, views: LedgerViews): Promise<Prepared> {
  switch (plan.type) {
    case "quote": {
      const bank = await loadBank<VerifiedQuote>("growth", "quotes.json");
      const { quote, needsReview } = pickVerifiedQuote(bank, views.all);
      return {
        payload: { quote: quote.quote, by: quote.by, source: quote.source },
        images: {},
        featured: [quote.id],
        quoteOverride: { body: quote.quote, heading: quote.by, subheading: quote.source ?? "" },
        forceReview: needsReview,
      };
    }

    case "book": {
      const bank = await loadBank<BookSeed>("growth", "books.json");
      const [picked] = pickUnused(bank, views.all, 1);
      // 표지: zoom=2(고해상) 우선, 실패 시 원본 썸네일
      const coverUrl = await fetchBookCoverUrl(picked.titleKo, picked.author);
      const coverUri =
        (await downloadCover(coverUrl?.replace("zoom=1", "zoom=2"))) ??
        (await downloadCover(coverUrl));
      return {
        payload: { coverImageKey: coverUri ? "bookcover" : undefined, book: picked },
        images: coverUri ? { bookcover: coverUri } : {},
        featured: [picked.id],
      };
    }

    case "habit": {
      const bank = await loadBank<TopicSeed>("growth", "habits.json");
      const [picked] = pickUnused(bank, views.all, 1);
      return { payload: { habit: picked }, images: {}, featured: [picked.id] };
    }

    case "mindset": {
      const bank = await loadBank<TopicSeed>("growth", "mindsets.json");
      const [picked] = pickUnused(bank, views.all, 1);
      return { payload: { mindset: picked }, images: {}, featured: [picked.id] };
    }

    default:
      throw new Error(`[growth] 알 수 없는 타입: ${plan.type}`);
  }
}

function fixture(plan: DayPlan, prepared: Prepared): PostDraft {
  const p = prepared.payload as any;
  const slides: Slide[] = [];

  switch (plan.type) {
    case "quote": {
      slides.push(
        { kind: "cover", badge: "MONDAY BOOST", heading: "오늘을 바꾸는\n한 문장", subheading: p.by, body: "오늘 하루를 붙잡아 줄\n문장을 준비했습니다." },
        { kind: "quote", heading: p.by, subheading: p.source, body: p.quote },
      );
      break;
    }
    case "book": {
      slides.push(
        { kind: "cover", badge: "BOOK", heading: String(p.book.titleKo).slice(0, 46), subheading: p.book.author, body: String(p.book.tagline).slice(0, 100) },
        { kind: "item", heading: p.book.titleKo, subheading: p.book.author, body: p.book.tagline, imageKey: p.coverImageKey },
      );
      for (const [i, idea] of (p.book.keyIdeas as string[]).slice(0, 3).entries()) {
        slides.push({
          kind: "news",
          badge: `핵심 ${i + 1}`,
          heading: String(idea).slice(0, 46),
          body: `『${p.book.titleKo}』 — ${p.book.tagline}`.slice(0, 210),
        });
      }
      break;
    }
    case "habit": {
      slides.push(
        { kind: "cover", badge: "HABIT", heading: String(p.habit.title).slice(0, 46), subheading: "오늘부터 실천", body: String(p.habit.hint).slice(0, 100) },
        { kind: "news", badge: "HOW", heading: p.habit.title, body: String(p.habit.hint).slice(0, 210) },
      );
      break;
    }
    case "mindset": {
      slides.push(
        { kind: "cover", badge: "MINDSET", heading: String(p.mindset.title).slice(0, 46), subheading: "생각의 도구", body: String(p.mindset.hint).slice(0, 100) },
        { kind: "news", badge: "WHAT", heading: p.mindset.title, body: String(p.mindset.hint).slice(0, 210) },
      );
      break;
    }
  }

  slides.push({ kind: "outro", heading: "매일 저녁 6시,\n성장 카드 한 장", body: "픽스처 모드로 생성된 테스트 초안입니다." });
  return {
    title: `[fixture] ${plan.type} ${plan.dateISO}`,
    slides: slides.slice(0, 9),
    caption: `[fixture] ${plan.type} 파이프라인 테스트 초안입니다.`,
    hashtags: ["자기계발", "동기부여", "성장", "습관", "독서", "책추천", "마인드셋", "갓생"],
  };
}

export const growthTopic: Topic = {
  id: "growth",
  defaultBrand: "GROW·CARDS",
  types: ["quote", "book", "habit", "mindset"],
  calendar: {
    1: "quote", //   월: 동기부여 명언 (Monday motivation)
    2: "book", //    화: 책 소개
    3: "habit", //   수: 습관·실천법
    4: "mindset", // 목: 마인드셋 개념
    5: "quote", //   금: 명언
    6: "book", //    토: 책 소개 2차
    0: "habit", //   일: 다음 주 준비 습관
  },
  typeLabels: {
    quote: "오늘의 명언",
    book: "책 소개",
    habit: "습관",
    mindset: "마인드셋",
  },
  modeOverrides: {},
  attribution: "명언은 각 인물, 책 정보·표지는 각 저서와 출판사 기준입니다(도서 DB: 알라딘·Google Books). 오류 제보 환영합니다.",
  theme: {
    accent: "#f59e0b",
    accentSoft: "#fcd34d",
    accent2: "#fb7185",
    highlight: "#facc15",
    gradTitle: "linear-gradient(100deg, #ffffff 20%, #fbbf24 60%, #fb7185 90%)",
    glowA: "rgba(180, 83, 9, 0.22)",
    glowB: "rgba(190, 18, 60, 0.15)",
    badgeGrad: "linear-gradient(120deg, #facc15, #fb7185)",
  },
  writerSystemExtra: `토픽: 자기계발·동기부여 계정 (독자: 성장에 관심 있는 20~30대).
- 명언(quote)은 입력 원문을 한 글자도 바꾸지 않는다.
- 책(book)은 입력 keyIdeas 범위에서 소개한다. 책에 없는 주장·수치를 만들지 않는다.
- habit/mindset은 hint를 출발점으로 네가 확신하는 일반 지식으로 풀어쓰되, 의학적·재정적 조언 단정 금지.
- 톤: 담백하고 실용적. 과한 동기부여 클리셰("당신은 할 수 있다" 남발)와 이모지 남용 금지.`,
  typeGuides: {
    quote: `구성: cover(명언 본문·인물명 노출 금지 — 이 문장이 필요한 상황으로 후킹, badge="오늘의 한 문장") → quote 슬라이드(heading=by, subheading=source, body=quote 원문 그대로) → news 스타일 1장(badge="APPLY", heading=오늘 적용법 한 줄, body=이 말을 오늘 하루에 적용하는 법 2문장) → outro(저장 유도).`,
    book: `구성 — 책 제목은 마지막에 공개한다(궁금증 유지가 생명):
1) cover: 책 제목·저자 노출 금지. keyIdeas가 해결하는 독자의 문제/욕구로 후킹(예: "삶이 무너질 때\\n버티게 해주는 3가지"). badge="오늘의 책".
2) news 3장: keyIdeas 하나씩. heading은 독자 상황으로 리프레이밍한 꽂히는 한 줄(원문 그대로 옮기지 말 것), body는 그 통찰을 일상 언어로 2~3문장. badge="첫 번째"/"두 번째"/"세 번째".
3) item 1장(책 공개): heading=titleKo, subheading=author, body=위 문장들이 담긴 책이라는 것+지금 읽을 이유 1~2문장, badge="책 공개". 입력에 coverImageKey가 있으면 imageKey에 그 값을 그대로.
4) outro: 저장 유도("저장해두고 흔들리는 날 다시 읽어보세요").
책 제목·저자는 3) 전까지 어떤 슬라이드에도 쓰지 않는다.`,
    habit: `구성: cover(습관명 노출 금지 — 독자의 실패 경험·욕구로 후킹, 예: "저녁마다 후회로\\n하루를 끝낸다면") → news 3장: badge="WHY"(습관 공개+왜 효과 있는지) / badge="HOW"(오늘 시작하는 구체적 방법) / badge="TIP"(흔한 실패 피하는 법) → outro(저장 유도).`,
    mindset: `구성: cover(개념명 노출 금지 — 그 개념이 필요한 상황으로 후킹) → news 3장: badge="WHAT"(개념 공개+쉬운 정의) / badge="EXAMPLE"(일상 예시 장면) / badge="APPLY"(오늘 적용법) → outro(저장 유도).`,
  },
  prepare,
  fixture,
};
