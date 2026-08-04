import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Prepared } from "./fetch.js";
import type { DayPlan } from "./plan.js";
import { PostDraftSchema, type PostDraft } from "./types.js";

const SYSTEM = `너는 애니메이션 카드뉴스 인스타그램 계정의 에디터다.
입력 JSON 데이터만 근거로 캐러셀 카드뉴스 초안(PostDraft)을 만든다.

절대 규칙:
- imageKey는 입력 데이터에 등장한 값만 그대로 쓴다. 새 키·URL을 만들지 않는다.
- 작품 제목: 입력에 titleKo가 있으면 반드시 그대로 쓴다. 없으면 네가 확신하는 한국 정식 발매 제목만 쓰고, 불확실하면 titleEnglish 또는 titleRomaji를 그대로 쓴다. 제목을 창작·직역하지 않는다.
- 뉴스는 입력 candidates의 title/description 내용만 요약한다. 새로운 사실·수치·날짜를 추가하지 않는다.
- 명대사(quote)가 입력에 있으면 한 글자도 바꾸지 않는다.
- caption에는 본문만 쓴다. 해시태그와 출처 문구는 시스템이 별도로 붙인다.

슬라이드 구성:
- 첫 장은 kind="cover" — 스와이프를 부르는 짧고 강한 훅. heading은 2줄 이내(줄바꿈 \\n).
- 마지막 장은 kind="outro" — heading은 내일/다음 콘텐츠 예고나 팔로우 유도 문구.
- cover의 imageKey는 대표작 1개를 고른다(입력에 이미지가 있는 타입만).

길이·형식:
- heading ≤ 20자/줄, 최대 2줄. body는 2~3줄, 줄당 ≤ 30자(줄바꿈 \\n 사용, schedule 제외).
- meta는 "TV 24화 · 스튜디오명 · 평점 89"처럼 가운뎃점(·) 구분.
- badge는 "1위", "NEWS 01" 같은 12자 이내 라벨.
- 톤: 팬심 있는 에디터. 과장·스포일러·이모지 남용 금지.

caption:
- 2~4문장 훅 + 다룬 작품/소식 리스트(줄바꿈). 끝인사 금지.`;

const TYPE_GUIDE: Record<string, string> = {
  trending: `구성: cover → rank 순서대로 item 5장(badge="N위", 각 항목의 imageKey) → outro.
item.body는 그 작품이 지금 뜨는 이유나 한 줄 소개.`,
  seasonal: `special=false: cover → item(작품 개요) → item(badge="관전 포인트", 같은 imageKey, body에 이 작품을 봐야 할 이유) → outro.
special=true(분기 라인업): cover → 기대작 item 5~6장(badge="기대작 N") → outro.`,
  classic: `구성: cover → item 3장(titleKo 그대로, body는 themes/note를 살린 2~3줄 추천 이유) → outro.
cover.heading은 세 작품을 묶는 테마 문구로.`,
  quote: `구성: cover(media의 imageKey, "오늘의 명대사"를 살린 훅) → quote 슬라이드(kind="quote", heading=character, subheading=workKo, body=quote 원문 그대로, imageKey=media의 것) → item(작품 한 줄 소개) → outro.`,
  news: `구성: cover → news 5장(badge="NEWS 01"~"NEWS 05", heading은 한국어 헤드라인 ≤ 2줄, body는 2문장 요약, meta="Anime News Network") → outro.
candidates에서 한국 팬에게 파급력 큰 5건을 고른다. 확실하지 않은 내용은 다루지 않는다.`,
  schedule: `구성: cover → schedule 슬라이드(요일당 1장, heading="월요일" 같은 요일, subheading="8월 10일" 같은 날짜, body는 "작품명 N화"를 줄바꿈으로 나열, 요일당 최대 4작품) → outro.
방영작 없는 요일은 생략. 전체 슬라이드 9장 이하.`,
};

/** Claude로 카드뉴스 초안 생성. 1회 재시도, 그래도 실패면 throw(호출부가 리뷰 강등 처리) */
export async function writeDraft(plan: DayPlan, prepared: Prepared): Promise<PostDraft> {
  const client = new Anthropic();
  const userMsg = [
    `오늘 날짜: ${plan.dateISO} (KST)`,
    `콘텐츠 타입: ${plan.type}${plan.seasonalSpecial ? " (분기 라인업 스페셜)" : ""}`,
    "",
    TYPE_GUIDE[plan.type],
    "",
    "입력 데이터:",
    JSON.stringify(prepared.payload, null, 2),
  ].join("\n");

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.parse({
        model: "claude-opus-5",
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
        output_config: { format: zodOutputFormat(PostDraftSchema) },
      });
      if (response.stop_reason === "refusal") throw new Error("writer가 요청을 거절했습니다.");
      const draft = response.parsed_output;
      if (!draft) throw new Error("structured output 파싱 실패");
      return postProcess(draft, prepared);
    } catch (err) {
      lastErr = err;
      console.warn(`writer 시도 ${attempt + 1} 실패:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastErr;
}

/** writer 출력에 코드 레벨 안전장치 적용 */
function postProcess(draft: PostDraft, prepared: Prepared): PostDraft {
  const validKeys = new Set(Object.keys(prepared.images));
  for (const slide of draft.slides) {
    // 존재하지 않는 imageKey는 제거(플레이스홀더 렌더)
    if (slide.imageKey && !validKeys.has(slide.imageKey)) delete slide.imageKey;
    // 명대사는 뱅크 원문으로 강제 덮어쓰기 — writer 출력을 신뢰하지 않음
    if (slide.kind === "quote" && prepared.quoteOverride) {
      slide.body = prepared.quoteOverride.body;
      slide.heading = prepared.quoteOverride.heading;
      slide.subheading = prepared.quoteOverride.subheading;
    }
  }
  return draft;
}
