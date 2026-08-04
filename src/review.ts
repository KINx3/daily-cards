import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { rawUrl } from "./github.js";
import { findEntry, loadLedger } from "./ledger.js";
import type { DayPlan, Topic } from "./topics/types.js";
import type { PostDraft, PublishMode } from "./types.js";

const run = promisify(execFile);

interface PackageMeta {
  topic: string;
  plan: DayPlan;
  mode: PublishMode;
  draft: PostDraft;
}

/** 리뷰 모드: 초안 패키지를 GitHub Issue로 게시 (CI에서 gh CLI 사용) */
export async function createReviewIssue(topic: Topic, dateISO: string): Promise<void> {
  const pkgDir = `out/${topic.id}/${dateISO}`;
  const meta = JSON.parse(await readFile(`${pkgDir}/draft.json`, "utf8")) as PackageMeta;
  const caption = (await readFile(`${pkgDir}/caption.txt`, "utf8")).trim();
  const entry = findEntry(await loadLedger(topic.id), dateISO);
  if (!entry) throw new Error(`ledger에 ${dateISO} 항목이 없습니다.`);

  const typeLabel = topic.typeLabels[meta.plan.type] ?? meta.plan.type;
  const title = `[초안][${topic.id}] ${dateISO} ${typeLabel} — ${meta.draft.title}`;

  // 재실행 시 중복 이슈 방지
  const { stdout: existing } = await run("gh", [
    "issue", "list", "--state", "open",
    "--search", `in:title "[초안][${topic.id}] ${dateISO}"`,
    "--json", "number",
  ]);
  if (JSON.parse(existing).length > 0) {
    console.log(`[review:${topic.id}] ${dateISO} 초안 이슈가 이미 열려 있음 — skip`);
    return;
  }

  const cards = entry.images
    .map((p, i) => `**${String(i + 1).padStart(2, "0")}**\n\n![카드 ${i + 1}](${rawUrl(p)})`)
    .join("\n\n");

  const body = `## [${topic.id}] ${typeLabel} 초안 (${meta.mode} 모드)

${cards}

## 캡션 (복사해서 사용)

\`\`\`
${caption}
\`\`\`

---
**발행 방법**: 이미지를 폰에 저장 → 인스타그램 캐러셀 업로드 → 위 캡션 붙여넣기 → 이 이슈 닫기
**반려**: 업로드하지 않고 이슈만 닫으면 됩니다. 소재는 이미 ledger에 기록되어 재등장하지 않습니다.
`;

  const bodyFile = `${pkgDir}/issue-body.md`;
  await writeFile(bodyFile, body);
  await run("gh", ["issue", "create", "--title", title, "--body-file", bodyFile]);
  console.log(`[review:${topic.id}] 초안 이슈 생성: ${title}`);
}
