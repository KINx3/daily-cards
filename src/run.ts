import { parseArgs } from "node:util";
import { BRAND } from "./config.js";
import { renderSlides } from "./render.js";
import { fetchSampleImages, SAMPLE_DRAFT } from "./sample.js";

const { values: args } = parseArgs({
  options: {
    sample: { type: "boolean", default: false },
    type: { type: "string" },
    date: { type: "string" },
    mode: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

async function main() {
  if (args.sample) {
    const images = await fetchSampleImages();
    const paths = await renderSlides(
      SAMPLE_DRAFT,
      images,
      { brand: BRAND, dateLabel: "2026.08.04", typeLabel: "주간 인기" },
      "out/sample",
    );
    console.log(`샘플 ${paths.length}장 렌더 완료:`);
    for (const p of paths) console.log(`  ${p}`);
    return;
  }

  // M2에서 구현: plan → fetch → write → render → deliver → ledger
  throw new Error("파이프라인은 M2에서 구현됩니다. 지금은 --sample만 지원해요.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
