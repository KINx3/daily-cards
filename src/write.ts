import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { DayPlan, Prepared, Topic } from "./topics/types.js";
import { PostDraftSchema, type PostDraft } from "./types.js";

const BASE_SYSTEM = `너는 카드뉴스 인스타그램 계정의 에디터다.
입력 JSON 데이터만 근거로 캐러셀 카드뉴스 초안(PostDraft)을 만든다.

절대 규칙:
- imageKey는 입력 데이터에 등장한 값만 그대로 쓴다. 새 키·URL을 만들지 않는다. 입력에 이미지가 없으면 imageKey를 아예 넣지 않는다.
- 뉴스·외부 데이터는 입력에 있는 내용 범위 안에서만 요약한다. 새로운 사실·수치·날짜를 추가하지 않는다.
- 인용문(quote)이 입력에 있으면 한 글자도 바꾸지 않는다.
- caption에는 본문만 쓴다. 해시태그와 출처 문구는 시스템이 별도로 붙인다.
- 모든 내용은 슬라이드 본문에 담는다. item·news·quote·schedule 슬라이드는 heading과 body를 반드시 채운다. 내용을 캡션에만 쓰고 슬라이드를 비워 두지 않는다.

슬라이드 구성:
- 첫 장은 kind="cover" — 스와이프를 부르는 짧고 강한 훅. heading은 2줄 이내(줄바꿈 \\n).
- 마지막 장은 kind="outro" — heading은 내일/다음 콘텐츠 예고나 팔로우 유도 문구.

길이·형식:
- heading ≤ 20자/줄, 최대 2줄. body는 2~3줄, 줄당 ≤ 30자(줄바꿈 \\n 사용).
- meta는 "TV 24화 · 스튜디오명 · 평점 89"처럼 가운뎃점(·) 구분.
- badge는 12자 이내 라벨.

caption:
- 2~4문장 훅 + 다룬 항목 리스트(줄바꿈). 끝인사 금지.`;

/** Claude로 카드뉴스 초안 생성. 1회 재시도, 그래도 실패면 throw(호출부가 리뷰 강등 처리) */
export async function writeDraft(
  topic: Topic,
  plan: DayPlan,
  prepared: Prepared,
): Promise<PostDraft> {
  const client = new Anthropic();
  const system = `${BASE_SYSTEM}\n\n${topic.writerSystemExtra}`;
  const userMsg = [
    `오늘 날짜: ${plan.dateISO} (KST)`,
    `콘텐츠 타입: ${plan.type}`,
    "",
    topic.typeGuides[plan.type],
    "",
    "입력 데이터:",
    JSON.stringify(prepared.payload, null, 2),
  ].join("\n");

  // 기본 Sonnet 5(adaptive thinking) — 카피 품질 충분 + Opus 5 대비 회당 1/2~1/3 비용.
  // repo 변수 WRITER_MODEL로 오버라이드 가능.
  const model = process.env.WRITER_MODEL || "claude-sonnet-5";

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.parse({
        model,
        // max_tokens는 thinking+본문 합산 상한 — 뉴스처럼 무거운 입력에서
        // 8000이면 본문 JSON이 잘려 파싱 실패했다(2026-08-05).
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: userMsg }],
        // effort medium: 카드 카피는 입력 데이터 재구성이라 충분 — thinking 토큰(=output 과금) 절감
        output_config: { format: zodOutputFormat(PostDraftSchema), effort: "medium" },
      });
      const u = response.usage;
      console.log(`[writer] ${model} tokens in=${u.input_tokens} out=${u.output_tokens}`);
      if (response.stop_reason === "refusal") throw new Error("writer가 요청을 거절했습니다.");
      const draft = response.parsed_output;
      if (!draft) throw new Error("structured output 파싱 실패");
      validateDraft(draft);
      return postProcess(draft, prepared);
    } catch (err) {
      lastErr = err;
      const detail = String(err instanceof Error ? err.message : err)
        .replace(/\s+/g, " ")
        .slice(0, 500);
      console.warn(`writer 시도 ${attempt + 1} 실패: ${detail}`);
    }
  }
  throw lastErr;
}

/** 빈 콘텐츠 슬라이드 차단 — 스키마 required의 이중 안전망. throw는 재시도→픽스처 강등 경로를 탄다. */
function validateDraft(draft: PostDraft): void {
  const empties: string[] = [];
  draft.slides.forEach((s, i) => {
    const needsBody = s.kind === "item" || s.kind === "news" || s.kind === "quote" || s.kind === "schedule";
    const noHeading = s.kind !== "outro" && !s.heading?.trim();
    const noBody = needsBody && !s.body?.trim();
    if (noHeading || noBody) empties.push(`#${i + 1}(${s.kind})`);
  });
  if (empties.length > 0) throw new Error(`빈 콘텐츠 슬라이드: ${empties.join(", ")}`);
}

/** 디자인 안전 길이 — 초과분은 말줄임. 파싱 실패로 하루를 잃는 것보다 낫다. */
const CLAMP = {
  heading: 48,
  subheading: 70,
  badge: 14,
  body: 220,
  meta: 70,
  title: 60,
  caption: 1500, // 출처 문구 + 해시태그가 뒤에 붙어도 IG 한도(2200) 안쪽
} as const;

function clamp(s: string, max: number): string;
function clamp(s: string | undefined, max: number): string | undefined;
function clamp(s: string | undefined, max: number): string | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/** writer 출력에 코드 레벨 안전장치 적용 */
function postProcess(draft: PostDraft, prepared: Prepared): PostDraft {
  const validKeys = new Set(Object.keys(prepared.images));
  for (const slide of draft.slides) {
    // 존재하지 않는 imageKey는 제거(플레이스홀더 렌더)
    if (slide.imageKey && !validKeys.has(slide.imageKey)) delete slide.imageKey;
    // kind별로 required가 갈리는 union이라, undefined를 다시 쓰지 않도록 있는 값만 자른다
    if (slide.heading !== undefined) slide.heading = clamp(slide.heading, CLAMP.heading);
    if (slide.subheading !== undefined) slide.subheading = clamp(slide.subheading, CLAMP.subheading);
    if (slide.badge !== undefined) slide.badge = clamp(slide.badge, CLAMP.badge);
    if (slide.body !== undefined) slide.body = clamp(slide.body, CLAMP.body);
    if (slide.meta !== undefined) slide.meta = clamp(slide.meta, CLAMP.meta);
    // 인용은 뱅크 원문으로 강제 덮어쓰기 — writer 출력을 신뢰하지 않음 (clamp보다 뒤 = 원문 무손실)
    if (slide.kind === "quote" && prepared.quoteOverride) {
      slide.body = prepared.quoteOverride.body;
      slide.heading = prepared.quoteOverride.heading;
      slide.subheading = prepared.quoteOverride.subheading || undefined;
    }
  }
  draft.title = clamp(draft.title, CLAMP.title)!;
  draft.caption = clamp(draft.caption, CLAMP.caption)!;
  draft.hashtags = draft.hashtags.slice(0, 20);
  return draft;
}
