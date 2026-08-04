import { loadBank, pickUnused, pickVerifiedQuote, type VerifiedQuote } from "../banks.js";
import { fetchRisingRepos } from "../github-api.js";
import { fetchWeeklyTop } from "../hn.js";
import { fetchFeeds } from "../rss.js";
import type { PostDraft, Slide } from "../types.js";
import type { DayPlan, LedgerViews, Prepared, Topic } from "./types.js";

interface ConceptSeed {
  id: string;
  title: string;
  hint: string;
}

interface ToolSeed {
  id: string;
  name: string;
  tagline: string;
  hint: string;
}

const AI_FEEDS = [
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
  { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },
];

async function prepare(plan: DayPlan, views: LedgerViews): Promise<Prepared> {
  switch (plan.type) {
    case "technews": {
      const stories = (await fetchWeeklyTop()).filter((s) => !views.all.has(s.id));
      if (stories.length < 3) throw new Error("이번 주 HN 고득점 스토리가 3건 미만입니다.");
      return {
        payload: {
          candidates: stories.map((s) => ({
            id: s.id,
            title: s.title,
            domain: s.domain,
            points: s.points,
            comments: s.comments,
          })),
        },
        images: {},
        featured: stories.map((s) => s.id),
      };
    }

    case "ainews": {
      const items = (await fetchFeeds(AI_FEEDS)).filter((n) => !views.all.has(n.guid));
      if (items.length < 3) throw new Error("이번 주 새 AI 뉴스가 3건 미만입니다.");
      return {
        payload: {
          candidates: items.map((n) => ({
            guid: n.guid,
            title: n.title,
            description: n.description,
            source: n.source,
            pubDate: n.pubDate,
          })),
        },
        images: {},
        featured: items.map((n) => n.guid),
      };
    }

    case "repos": {
      const repos = (await fetchRisingRepos()).filter((r) => !views.recent.has(r.id)).slice(0, 5);
      if (repos.length < 3) throw new Error("소개할 새 리포가 3개 미만입니다.");
      return {
        payload: {
          items: repos.map((r) => ({
            id: r.id,
            name: r.name,
            fullName: r.fullName,
            description: r.description,
            stars: r.stars,
            language: r.language,
            topics: r.topics.slice(0, 5),
          })),
        },
        images: {},
        featured: repos.map((r) => r.id),
      };
    }

    case "concept": {
      const bank = await loadBank<ConceptSeed>("tech", "concepts.json");
      const [picked] = pickUnused(bank, views.all, 1);
      return { payload: { concept: picked }, images: {}, featured: [picked.id] };
    }

    case "tools": {
      const bank = await loadBank<ToolSeed>("tech", "tools.json");
      const picked = pickUnused(bank, views.all, 3);
      return { payload: { items: picked }, images: {}, featured: picked.map((t) => t.id) };
    }

    case "devquote": {
      const bank = await loadBank<VerifiedQuote>("tech", "devquotes.json");
      const { quote, needsReview } = pickVerifiedQuote(bank, views.all);
      return {
        payload: { quote: quote.quote, by: quote.by, source: quote.source },
        images: {},
        featured: [quote.id],
        quoteOverride: { body: quote.quote, heading: quote.by, subheading: quote.source ?? "" },
        forceReview: needsReview,
      };
    }

    default:
      throw new Error(`[tech] 알 수 없는 타입: ${plan.type}`);
  }
}

function fixture(plan: DayPlan, prepared: Prepared): PostDraft {
  const p = prepared.payload as any;
  const slides: Slide[] = [];

  switch (plan.type) {
    case "technews": {
      slides.push({ kind: "cover", badge: "WEEKLY", heading: "이번 주\n해커뉴스 베스트", subheading: `${plan.dateLabel} 기준` });
      for (const [i, s] of (p.candidates as any[]).slice(0, 5).entries()) {
        slides.push({
          kind: "news",
          badge: `TOP ${String(i + 1).padStart(2, "0")}`,
          heading: String(s.title).slice(0, 46),
          body: `${s.points} points · 댓글 ${s.comments}`,
          meta: `Hacker News${s.domain ? ` · ${s.domain}` : ""}`,
        });
      }
      break;
    }
    case "ainews": {
      slides.push({ kind: "cover", badge: "AI NEWS", heading: "이번 주\nAI 뉴스 다이제스트", subheading: `${plan.dateLabel} 기준` });
      for (const [i, n] of (p.candidates as any[]).slice(0, 5).entries()) {
        slides.push({
          kind: "news",
          badge: `NEWS ${String(i + 1).padStart(2, "0")}`,
          heading: String(n.title).slice(0, 46),
          body: String(n.description).slice(0, 210),
          meta: n.source,
        });
      }
      break;
    }
    case "repos": {
      slides.push({ kind: "cover", badge: "GITHUB", heading: "이번 주\n주목할 리포", subheading: "스타 급상승 기준" });
      for (const it of (p.items as any[]).slice(0, 5)) {
        slides.push({
          kind: "item",
          heading: String(it.name).slice(0, 46),
          subheading: it.fullName,
          meta: [it.language, `★ ${it.stars.toLocaleString()}`].filter(Boolean).join(" · "),
          body: it.description ? String(it.description).slice(0, 150) : undefined,
        });
      }
      break;
    }
    case "concept": {
      slides.push(
        { kind: "cover", badge: "CONCEPT", heading: String(p.concept.title).slice(0, 46), subheading: "한 장 정리" },
        { kind: "news", badge: "WHAT", heading: p.concept.title, body: String(p.concept.hint).slice(0, 210) },
      );
      break;
    }
    case "tools": {
      slides.push({ kind: "cover", badge: "TOOLS", heading: "써볼 만한\n개발 도구", subheading: "이번 주 3선" });
      for (const t of p.items as any[]) {
        slides.push({
          kind: "item",
          heading: t.name,
          subheading: t.tagline,
          body: String(t.hint).slice(0, 150),
        });
      }
      break;
    }
    case "devquote": {
      slides.push(
        { kind: "cover", badge: "DEV QUOTE", heading: "일요일의\n개발자 명언", subheading: p.by },
        { kind: "quote", heading: p.by, subheading: p.source, body: p.quote },
      );
      break;
    }
  }

  slides.push({ kind: "outro", heading: "매일 저녁 6시,\n테크 소식을 카드로", body: "픽스처 모드로 생성된 테스트 초안입니다." });
  return {
    title: `[fixture] ${plan.type} ${plan.dateISO}`,
    slides: slides.slice(0, 9),
    caption: `[fixture] ${plan.type} 파이프라인 테스트 초안입니다.`,
    hashtags: ["개발자", "테크뉴스", "AI", "프로그래밍", "코딩", "개발", "IT", "기술트렌드"],
  };
}

export const techTopic: Topic = {
  id: "tech",
  defaultBrand: "TECH·CARDS",
  types: ["technews", "ainews", "repos", "concept", "tools", "devquote"],
  calendar: {
    1: "technews", // 월: 주간 HN 베스트
    2: "repos", //    화: GitHub 주목 리포
    3: "ainews", //   수: AI 뉴스 다이제스트
    4: "concept", //  목: 개발·AI 개념 한 장
    5: "tools", //    금: 개발 도구 3선
    6: "repos", //    토: GitHub 주목 리포 2차
    0: "devquote", // 일: 개발자 명언
  },
  typeLabels: {
    technews: "주간 테크",
    ainews: "AI 뉴스",
    repos: "깃허브",
    concept: "개념 정리",
    tools: "개발 도구",
    devquote: "개발자 명언",
  },
  modeOverrides: { technews: "review", ainews: "review" },
  attribution: "출처: Hacker News · GitHub · 각 기사 원문 (캡션 표기)",
  theme: {
    accent: "#38bdf8",
    accentSoft: "#7dd3fc",
    accent2: "#22d3ee",
    highlight: "#4ade80",
    gradTitle: "linear-gradient(100deg, #ffffff 20%, #38bdf8 60%, #22d3ee 90%)",
    glowA: "rgba(14, 116, 144, 0.25)",
    glowB: "rgba(30, 64, 175, 0.18)",
    badgeGrad: "linear-gradient(120deg, #4ade80, #22d3ee)",
  },
  writerSystemExtra: `토픽: 개발자·AI 정보 계정 (독자: 한국 개발자·테크 관심층).
- 뉴스(technews)는 제목·포인트 수 범위 안에서만 쓴다. 기사 내용을 추측·창작하지 않는다. 제목 번역 + "왜 화제인지"는 제목에서 읽히는 범위까지만.
- ainews는 입력 description 범위 안에서 요약한다.
- concept/tools는 네가 확신하는 일반 기술 지식으로 설명하되, 버전 번호·벤치마크 수치·가격 등 변동 정보는 쓰지 않는다.
- 톤: 실무 개발자에게 말하듯 간결하게. 유행어 남발 금지.`,
  typeGuides: {
    technews: `구성: cover → news 5장(badge="TOP 01"~, heading=한국어 헤드라인 ≤2줄, body="N points · 댓글 M" + 제목 범위 내 한 줄, meta="Hacker News · 도메인") → outro.
candidates에서 한국 개발자에게 흥미로운 5건을 고른다.`,
    ainews: `구성: cover → news 5장(badge="NEWS 01"~, heading=한국어 헤드라인 ≤2줄, body=description 기반 2문장 요약, meta=source) → outro.`,
    repos: `구성: cover → item 5장(heading=리포 이름, subheading=fullName, meta="언어 · ★스타수", body=description의 한국어 요약+어디에 쓰는 물건인지) → outro.`,
    concept: `구성: cover(개념명 훅) → news 스타일 3장: badge="WHAT"(정의 2~3문장) / badge="WHY"(왜 중요한지·언제 쓰는지) / badge="EXAMPLE"(구체 예시 하나) → outro.
hint를 출발점으로 네 지식으로 정확하게 풀어쓴다. meta는 비움.`,
    tools: `구성: cover → item 3장(heading=도구 이름, subheading=tagline, body=핵심 기능과 추천 상황 2~3줄) → outro.`,
    devquote: `구성: cover(인물명 훅) → quote 슬라이드(heading=by, subheading=source, body=quote 원문 그대로) → news 스타일 1장(badge="CONTEXT", 이 말의 맥락·적용 2문장) → outro.`,
  },
  prepare,
  fixture,
};
