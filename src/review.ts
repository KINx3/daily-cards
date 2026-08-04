import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { TYPE_LABELS } from "./config.js";
import { rawUrl } from "./github.js";
import { findEntry, loadLedger } from "./ledger.js";
import type { DayPlan } from "./plan.js";
import type { PostDraft, PublishMode } from "./types.js";

const run = promisify(execFile);

interface PackageMeta {
  plan: DayPlan;
  mode: PublishMode;
  draft: PostDraft;
}

/** 리뷰 모드: 초안 패키지를 GitHub Issue로 게시 (CI에서 gh CLI 사용) */
export async function createReviewIssue(dateISO: string): Promise<void> {
  const meta = JSON.parse(await readFile(`out/${dateISO}/draft.json`, "utf8")) as PackageMeta;
  const caption = (await readFile(`out/${dateISO}/caption.txt`, "utf8")).trim();
  const entry = findEntry(await loadLedger(), dateISO);
  if (!entry) throw new Error(`ledger에 ${dateISO} 항목이 없습니다.`);

  const title = `[초안] ${dateISO} ${TYPE_LABELS[meta.plan.type]} — ${meta.draft.title}`;

  // 재실행 시 중복 이슈 방지
  const { stdout: existing } = await run("gh", [
    "issue", "list", "--state", "open", "--search", `in:title "[초안] ${dateISO}"`, "--json", "number",
  ]);
  if (JSON.parse(existing).length > 0) {
    console.log(`[review] ${dateISO} 초안 이슈가 이미 열려 있음 — skip`);
    return;
  }

  const cards = entry.images
    .map((p, i) => `**${String(i + 1).padStart(2, "0")}**\n\n![카드 ${i + 1}](${rawUrl(p)})`)
    .join("\n\n");

  const body = `## ${TYPE_LABELS[meta.plan.type]} 초안 (${meta.mode} 모드)

${cards}

## 캡션 (복사해서 사용)

\`\`\`
${caption}
\`\`\`

---
**발행 방법**: 이미지를 폰에 저장 → 인스타그램 캐러셀 업로드 → 위 캡션 붙여넣기 → 이 이슈 닫기
**반려**: 업로드하지 않고 이슈만 닫으면 됩니다. 소재는 이미 ledger에 기록되어 재등장하지 않습니다.
`;

  const bodyFile = `out/${dateISO}/issue-body.md`;
  await writeFile(bodyFile, body);
  await run("gh", ["issue", "create", "--title", title, "--body-file", bodyFile]);
  console.log(`[review] 초안 이슈 생성: ${title}`);
}
