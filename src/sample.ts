import type { ImageMap, PostDraft } from "./types.js";

/** 디자인 검증용 샘플 드래프트. --sample 실행 시 AniList에서 커버 1장을 실제로 받아본다. */
export const SAMPLE_DRAFT: PostDraft = {
  title: "이번 주 가장 뜨거운 애니 TOP 3",
  slides: [
    {
      kind: "cover",
      badge: "WEEKLY TOP 3",
      heading: "이번 주\n가장 뜨거운 애니",
      subheading: "8월 1주차 · AniList 트렌딩 기준",
      imageKey: "frieren",
    },
    {
      kind: "item",
      badge: "1위",
      heading: "장송의 프리렌",
      subheading: "Sousou no Frieren",
      meta: "TV 28화 · 매드하우스 · 평점 89",
      body: "천 년을 사는 엘프 마법사가\n먼저 떠난 동료들의 시간을 뒤따라 걷는 이야기.",
      imageKey: "frieren",
    },
    {
      kind: "quote",
      heading: "히메노",
      subheading: "장송의 프리렌",
      body: "사람의 마음은,\n말하지 않으면 전해지지 않아.",
      imageKey: "frieren",
    },
    {
      kind: "outro",
      heading: "매일 저녁 6시,\n애니 소식을 카드로",
      body: "내일은 명대사 카드로 찾아옵니다.",
    },
  ],
  caption: "샘플 캡션",
  hashtags: ["애니", "애니추천", "카드뉴스", "애니메이션", "명작", "오타쿠", "장송의프리렌", "주간랭킹"],
};

/** AniList에서 커버 1장 다운로드(실패해도 플레이스홀더로 렌더 가능) */
export async function fetchSampleImages(): Promise<ImageMap> {
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query { Media(id: 154587) { coverImage { extraLarge } } }`,
      }),
    });
    const json = (await res.json()) as any;
    const url: string | undefined = json?.data?.Media?.coverImage?.extraLarge;
    if (!url) return {};
    const img = await fetch(url);
    const buf = Buffer.from(await img.arrayBuffer());
    const mime = img.headers.get("content-type") ?? "image/jpeg";
    return { frieren: `data:${mime};base64,${buf.toString("base64")}` };
  } catch {
    console.warn("샘플 커버 다운로드 실패 — 플레이스홀더로 렌더합니다.");
    return {};
  }
}
