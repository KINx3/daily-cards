import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ATTRIBUTION_FOOTER, BRAND, TYPE_LABELS } from "./config.js";
import { prepare } from "./fetch.js";
import { buildFixtureDraft } from "./fixture.js";
import {
  appendLedger,
  findEntry,
  loadLedger,
  recentAnilistIds,
  usedNewsGuids,
  usedQuoteIds,
} from "./ledger.js";
import { planForDate, todayKST } from "./plan.js";
import { renderSlides } from "./render.js";
import { fetchSampleImages, SAMPLE_DRAFT } from "./sample.js";
import { CONTENT_TYPES, type ContentType, type PostDraft, type PublishMode } from "./types.js";
import { writeDraft } from "./write.js";

const { values: args } = parseArgs({
  options: {
    sample: { type: "boolean", default: false },
    publish: { type: "boolean", default: false },
    review: { type: "boolean", default: false },
    type: { type: "string" },
    date: { type: "string" },
    mode: { type: "string" },
    fixture: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

function assembleCaption(draft: PostDraft): string {
  const tags = draft.hashtags
    .map((t) => "#" + t.replace(/^#/, "").replace(/\s+/g, ""))
    .join(" ");
  return [draft.caption.trim(), ATTRIBUTION_FOOTER, tags].join("\n\n");
}

async function generate(): Promise<void> {
  const dateISO = args.date ?? todayKST();
  if (args.type && !CONTENT_TYPES.includes(args.type as ContentType)) {
    throw new Error(`--type은 ${CONTENT_TYPES.join("|")} 중 하나여야 합니다.`);
  }
  const plan = planForDate(dateISO, args.type as ContentType | undefined);

  const ledger = await loadLedger();
  const existing = findEntry(ledger, dateISO);
  if (existing) {
    console.log(`${dateISO}는 이미 생성됨(${existing.type}, ig=${existing.igMediaId ?? "미발행"}) — skip`);
    return;
  }

  console.log(`[plan] ${dateISO} → ${plan.type}${plan.seasonalSpecial ? " (분기 스페셜)" : ""} / ${plan.mode}`);
  const prepared = await prepare(
    plan,
    recentAnilistIds(ledger),
    usedQuoteIds(ledger),
    usedNewsGuids(ledger),
  );

  let mode: PublishMode = (args.mode as PublishMode) ?? plan.mode;
  let draft: PostDraft;
  if (args.fixture) {
    draft = buildFixtureDraft(plan, prepared);
    mode = "review";
  } else {
    try {
      draft = await writeDraft(plan, prepared);
    } catch (err) {
      console.warn("writer 실패 — 픽스처 초안으로 리뷰 강등:", err instanceof Error ? err.message : err);
      draft = buildFixtureDraft(plan, prepared);
      draft.caption = "⚠️ writer 실패로 자동 생성된 픽스처 초안입니다. 검토 후 직접 수정하세요.\n\n" + draft.caption;
      mode = "review";
    }
  }
  if (prepared.forceReview) mode = "review";

  const outDir = `out/${dateISO}`;
  const paths = await renderSlides(
    draft,
    prepared.images,
    { brand: BRAND, dateLabel: plan.dateLabel, typeLabel: TYPE_LABELS[plan.type] },
    outDir,
  );
  const caption = assembleCaption(draft);
  await writeFile(`${outDir}/draft.json`, JSON.stringify({ plan, mode, draft }, null, 2) + "\n");
  await writeFile(`${outDir}/caption.txt`, caption + "\n");

  await appendLedger({
    date: dateISO,
    type: plan.type,
    mode,
    igMediaId: null,
    anilistIds: prepared.anilistIds,
    quoteId: prepared.quoteId,
    newsGuids: prepared.newsGuids,
    images: paths,
  });

  console.log(`[done] ${paths.length}장 렌더 → ${outDir}/ (mode=${mode})`);
}

async function main() {
  if (args.sample) {
    const images = await fetchSampleImages();
    const paths = await renderSlides(
      SAMPLE_DRAFT,
      images,
      { brand: BRAND, dateLabel: todayKST().replaceAll("-", "."), typeLabel: "주간 인기" },
      "out/sample",
    );
    console.log(`샘플 ${paths.length}장 렌더 완료:`);
    for (const p of paths) console.log(`  ${p}`);
    return;
  }

  if (args.publish) {
    const { publishFromPackage } = await import("./publish.js");
    await publishFromPackage(args.date ?? todayKST(), args["dry-run"]);
    return;
  }

  if (args.review) {
    const { createReviewIssue } = await import("./review.js");
    await createReviewIssue(args.date ?? todayKST());
    return;
  }

  await generate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
