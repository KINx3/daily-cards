import { z } from "zod";

export type PublishMode = "auto" | "review";

// 상한은 넉넉하게 — 빡빡한 max는 structured output 클라이언트 검증 실패(→픽스처 강등)를 유발한다.
// 디자인 안전 길이는 write.ts postProcess가 잘라서 보장한다.
// kind별 required는 서버측 constrained decoding이 강제한다 — 전 필드 optional이던 시절
// writer가 badge만 있는 빈 슬라이드를 합법적으로 냈다(2026-08-05, 이슈 #6·#10·#12).
const slideCommon = {
  subheading: z.string().max(120).optional(),
  badge: z.string().max(24).optional(),
  meta: z.string().max(120).optional(),
  imageKey: z.string().optional(),
};
const heading = z.string().max(90);
const body = z.string().max(400);

export const SlideSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cover"), heading, body: body.optional(), ...slideCommon }),
  z.object({ kind: z.literal("item"), heading, body, ...slideCommon }),
  z.object({ kind: z.literal("quote"), heading, body, ...slideCommon }),
  z.object({ kind: z.literal("news"), heading, body, ...slideCommon }),
  z.object({ kind: z.literal("schedule"), heading, body, ...slideCommon }),
  z.object({ kind: z.literal("outro"), heading: heading.optional(), body: body.optional(), ...slideCommon }),
]);
export type Slide = z.infer<typeof SlideSchema>;

export const PostDraftSchema = z.object({
  title: z.string().max(80),
  slides: z.array(SlideSchema).min(3).max(9),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).min(5).max(30),
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
