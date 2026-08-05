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
      return { payload: { book: picked }, images: {}, featured: [picked.id] };
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
        { kind: "cover", badge: "MONDAY BOOST", heading: "오늘을 바꾸는\n한 문장", subheading: p.by },
        { kind: "quote", heading: p.by, subheading: p.source, body: p.quote },
      );
      break;
    }
    case "book": {
      slides.push(
        { kind: "cover", badge: "BOOK", heading: String(p.book.titleKo).slice(0, 46), subheading: p.book.author },
        { kind: "item", heading: p.book.titleKo, subheading: p.book.author, body: p.book.tagline },
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
        { kind: "cover", badge: "HABIT", heading: String(p.habit.title).slice(0, 46), subheading: "오늘부터 실천" },
        { kind: "news", badge: "HOW", heading: p.habit.title, body: String(p.habit.hint).slice(0, 210) },
      );
      break;
    }
    case "mindset": {
      slides.push(
        { kind: "cover", badge: "MINDSET", heading: String(p.mindset.title).slice(0, 46), subheading: "생각의 도구" },
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
  attribution: "명언은 각 인물, 책 정보는 각 저서 기준입니다. 오류 제보 환영합니다.",
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
    quote: `구성: cover(문장을 궁금하게 만드는 훅, 명언 본문은 노출 금지) → quote 슬라이드(heading=by, subheading=source, body=quote 원문 그대로) → news 스타일 1장(badge="APPLY", 이 말을 오늘 하루에 적용하는 법 2문장) → outro.`,
    book: `구성: cover(책 제목 훅) → item(heading=titleKo, subheading=author, body=tagline 기반 2~3줄) → keyIdeas 각각을 news 스타일 카드로(badge="핵심 1"~, heading=아이디어 압축 ≤2줄, body=1~2문장 부연) → outro. 전체 9장 이하.`,
    habit: `구성: cover(습관명 훅) → news 스타일 3장: badge="WHY"(왜 효과 있는지) / badge="HOW"(구체적 실행법, 오늘 시작할 수 있게) / badge="TIP"(지속 요령·흔한 실패 회피) → outro.`,
    mindset: `구성: cover(개념명 훅) → news 스타일 3장: badge="WHAT"(정의) / badge="EXAMPLE"(일상 예시) / badge="APPLY"(적용법) → outro.`,
  },
  prepare,
  fixture,
};
