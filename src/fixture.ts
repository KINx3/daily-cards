import type { Prepared } from "./fetch.js";
import type { DayPlan } from "./plan.js";
import type { PostDraft, Slide } from "./types.js";

/**
 * --fixture: Claude 없이 결정적 초안 생성 (파이프라인/CI 검증용).
 * 한국어 제목 번역 없음 — 원제 그대로 노출된다.
 */
export function buildFixtureDraft(plan: DayPlan, prepared: Prepared): PostDraft {
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
        imageKey: items[0]?.imageKey,
      });
      for (const [i, it] of items.entries()) {
        slides.push({
          kind: "item",
          badge: plan.type === "trending" ? `${i + 1}위` : undefined,
          heading: String(title(it)).slice(0, 46),
          subheading: it.titleKo ? (it.titleEnglish ?? it.titleRomaji)?.slice(0, 68) : undefined,
          meta: meta(it),
          body: it.genres?.length ? it.genres.join(" · ") : undefined,
          imageKey: it.imageKey,
        });
      }
      break;
    }
    case "quote": {
      slides.push(
        { kind: "cover", badge: "오늘의 명대사", heading: "한 문장이\n오래 남을 때", subheading: p.workKo, imageKey: p.media?.imageKey },
        { kind: "quote", heading: p.character, subheading: p.workKo, body: p.quote, imageKey: p.media?.imageKey },
        { kind: "item", heading: p.workKo, subheading: p.media?.titleRomaji, meta: p.media ? meta(p.media) : undefined, imageKey: p.media?.imageKey },
      );
      break;
    }
    case "news": {
      const items: any[] = p.candidates.slice(0, 5);
      slides.push({ kind: "cover", badge: "WEEKLY NEWS", heading: "이번 주\n애니 뉴스 다이제스트", subheading: `${plan.dateLabel} 기준` });
      for (const [i, n] of items.entries()) {
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
      slides.push({ kind: "cover", badge: "NEXT WEEK", heading: "다음 주\n방영 일정", subheading: "인기작 기준" });
      for (const day of (p.days as any[]).slice(0, 7)) {
        const [datePart, weekdayPart] = splitDayLabel(day.label);
        slides.push({
          kind: "schedule",
          heading: weekdayPart,
          subheading: datePart,
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

/** "8월 10일 월요일" → ["8월 10일", "월요일"] */
function splitDayLabel(label: string): [string, string] {
  const m = label.match(/^(.*?)\s*([가-힣]+요일)$/);
  return m ? [m[1], m[2]] : [label, label];
}
