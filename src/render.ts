import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { CARD_HEIGHT, CARD_WIDTH, JPEG_QUALITY } from "./config.js";
import type { TopicTheme } from "./topics/types.js";
import type { ImageMap, PostDraft, RenderContext } from "./types.js";

/** TopicTheme → card.html CSS 변수 맵 */
export function themeVars(t: TopicTheme): Record<string, string> {
  return {
    "--accent": t.accent,
    "--accent-soft": t.accentSoft,
    "--accent-2": t.accent2,
    "--highlight": t.highlight,
    "--grad-title": t.gradTitle,
    "--glow-a": t.glowA,
    "--glow-b": t.glowB,
    "--badge-grad": t.badgeGrad,
  };
}

const TEMPLATE = pathToFileURL(resolve("template/card.html")).href;

/** draft.slides를 순서대로 렌더링해 outDir/01.jpg..NN.jpg 경로 배열을 반환 */
export async function renderSlides(
  draft: PostDraft,
  images: ImageMap,
  ctx: RenderContext,
  outDir: string,
): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CARD_WIDTH, height: CARD_HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.goto(TEMPLATE);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate((imgs) => (window as any).setImages(imgs), images);

    const paths: string[] = [];
    for (const [i, slide] of draft.slides.entries()) {
      await page.evaluate(
        ([s, c]) => (window as any).renderSlide(s, c),
        [slide, { ...ctx, index: i, total: draft.slides.length }] as const,
      );
      await page.evaluate(() =>
        Promise.all(
          Array.from(document.images).map((img) => img.decode().catch(() => {})),
        ),
      );
      const path = `${outDir}/${String(i + 1).padStart(2, "0")}.jpg`;
      await page.screenshot({ path, type: "jpeg", quality: JPEG_QUALITY });
      paths.push(path);
    }
    return paths;
  } finally {
    await browser.close();
  }
}
