import { z } from "zod";

export type PublishMode = "auto" | "review";

// 상한은 넉넉하게 — 빡빡한 max는 structured output 클라이언트 검증 실패(→픽스처 강등)를 유발한다.
// 디자인 안전 길이는 write.ts postProcess가 잘라서 보장한다.
// heading·body는 전 kind 필수 — 서버측 constrained decoding이 강제한다. 전 필드 optional이던
// 시절 writer가 badge만 있는 빈 슬라이드를 냈다(2026-08-05, 이슈 #6·#10·#12).
// 주의: kind별 discriminatedUnion은 쓰지 말 것 — SDK가 z.literal의 const를 description으로
// 강등시켜 anyOf 판별자가 사라지고, 전부-optional 변형으로 통과해 required가 무력화된다(실측).
export const SlideSchema = z.object({
  kind: z.enum(["cover", "item", "quote", "news", "schedule", "outro"]),
  heading: z.string().max(90),
  body: z.string().max(400),
  subheading: z.string().max(120).optional(),
  badge: z.string().max(24).optional(),
  meta: z.string().max(120).optional(),
  imageKey: z.string().optional(),
});
export type Slide = z.infer<typeof SlideSchema>;

export const PostDraftSchema = z.object({
  title: z.string().max(80),
  slides: z.array(SlideSchema).min(3).max(9),
  caption: z.string().max(2200),
  // min을 두지 않는다 — 배열 개수 제약은 서버가 강제 못 해 클라 검증 실패(→픽스처 강등)만 만든다
  hashtags: z.array(z.string()).max(30),
});
export type PostDraft = z.infer<typeof PostDraftSchema>;

/** imageKey → data URI (렌더 결정성을 위해 fetch 단계에서 미리 다운로드) */
export type ImageMap = Record<string, string>;

/** 카드 상단/하단 크롬 + 테마 컨텍스트 */
export interface RenderContext {
  brand: string;
  dateLabel: string;
  typeLabel: string;
  /** 토픽 컬러 테마 (없으면 템플릿 기본값=바이올렛) */
  theme?: Record<string, string>;
}
