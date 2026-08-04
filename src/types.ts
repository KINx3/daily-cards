import { z } from "zod";

export const CONTENT_TYPES = [
  "trending",
  "classic",
  "news",
  "quote",
  "seasonal",
  "schedule",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export type PublishMode = "auto" | "review";

export const SlideSchema = z.object({
  kind: z.enum(["cover", "item", "quote", "news", "schedule", "outro"]),
  heading: z.string().max(48).optional(),
  subheading: z.string().max(70).optional(),
  badge: z.string().max(14).optional(),
  body: z.string().max(220).optional(),
  meta: z.string().max(70).optional(),
  imageKey: z.string().optional(),
});
export type Slide = z.infer<typeof SlideSchema>;

export const PostDraftSchema = z.object({
  title: z.string().max(40),
  slides: z.array(SlideSchema).min(4).max(9),
  caption: z.string().max(1800),
  hashtags: z.array(z.string()).min(8).max(20),
});
export type PostDraft = z.infer<typeof PostDraftSchema>;

/** imageKey → data URI (렌더 결정성을 위해 fetch 단계에서 미리 다운로드) */
export type ImageMap = Record<string, string>;

/** 카드 상단/하단 크롬에 들어가는 컨텍스트 */
export interface RenderContext {
  brand: string;
  dateLabel: string;
  typeLabel: string;
}
