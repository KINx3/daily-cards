import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { brandFor } from "./config.js";
import { appendLedger, findEntry, ledgerViews, loadLedger } from "./ledger.js";
import { planForDate, todayKST } from "./plan.js";
import { renderSlides, themeVars } from "./render.js";
import { fetchSampleImages, SAMPLE_DRAFT } from "./sample.js";
import { getTopic } from "./topics/index.js";
import type { Topic } from "./topics/types.js";
import type { PostDraft, PublishMode } from "./types.js";
import { writeDraft } from "./write.js";

const { values: args } = parseArgs({
  options: {
    topic: { type: "string", default: "ani" },
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

function assembleCaption(topic: Topic, draft: PostDraft): string {
  const tags = draft.hashtags
    .map((t) => "#" + t.replace(/^#/, "").replace(/\s+/g, ""))
    .join(" ");
  return [draft.caption.trim(), topic.attribution, tags].join("\n\n");
}

async function generate(topic: Topic): Promise<void> {
  const dateISO = args.date ?? todayKST();
  const plan = planForDate(topic, dateISO, args.type);

  const ledger = await loadLedger(topic.id);
  const existing = findEntry(ledger, dateISO);
  if (existing) {
    console.log(
      `[${topic.id}] ${dateISO}는 이미 생성됨(${existing.type}, ig=${existing.igMediaId ?? "미발행"}) — skip`,
    );
    return;
  }

  console.log(`[${topic.id}] ${dateISO} → ${plan.type} / ${plan.mode}`);
  const prepared = await topic.prepare(plan, ledgerViews(ledger));

  let mode: PublishMode = (args.mode as PublishMode) ?? plan.mode;
  let draft: PostDraft;
  if (args.fixture) {
    draft = topic.fixture(plan, prepared);
    mode = "review";
  } else {
    try {
      draft = await writeDraft(topic, plan, prepared);
    } catch (err) {
      console.warn("writer 실패 — 픽스처 초안으로 리뷰 강등:", err instanceof Error ? err.message : err);
      draft = topic.fixture(plan, prepared);
      draft.caption =
        "⚠️ writer 실패로 자동 생성된 픽스처 초안입니다. 검토 후 직접 수정하세요.\n\n" + draft.caption;
      mode = "review";
    }
  }
  if (prepared.forceReview) mode = "review";

  const outDir = `out/${topic.id}/${dateISO}`;
  const paths = await renderSlides(
    draft,
    prepared.images,
    {
      brand: brandFor(topic),
      dateLabel: plan.dateLabel,
      typeLabel: topic.typeLabels[plan.type],
      theme: themeVars(topic.theme),
    },
    outDir,
  );
  const caption = assembleCaption(topic, draft);
  await writeFile(`${outDir}/draft.json`, JSON.stringify({ topic: topic.id, plan, mode, draft }, null, 2) + "\n");
  await writeFile(`${outDir}/caption.txt`, caption + "\n");

  await appendLedger(topic.id, {
    date: dateISO,
    type: plan.type,
    mode,
    igMediaId: null,
    featured: prepared.featured,
    images: paths,
  });

  console.log(`[${topic.id}] ${paths.length}장 렌더 → ${outDir}/ (mode=${mode})`);
}

async function main() {
  const topic = getTopic(args.topic!);

  if (args.sample) {
    const images = await fetchSampleImages();
    const paths = await renderSlides(
      SAMPLE_DRAFT,
      images,
      {
        brand: brandFor(topic),
        dateLabel: todayKST().replaceAll("-", "."),
        typeLabel: "주간 인기",
        theme: themeVars(topic.theme),
      },
      `out/sample/${topic.id}`,
    );
    console.log(`샘플 ${paths.length}장 렌더 완료:`);
    for (const p of paths) console.log(`  ${p}`);
    return;
  }

  if (args.publish) {
    const { publishFromPackage } = await import("./publish.js");
    await publishFromPackage(topic, args.date ?? todayKST(), args["dry-run"]);
    return;
  }

  if (args.review) {
    const { createReviewIssue } = await import("./review.js");
    await createReviewIssue(topic, args.date ?? todayKST());
    return;
  }

  await generate(topic);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
