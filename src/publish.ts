import { readFile } from "node:fs/promises";
import { rawUrl, requireEnv } from "./github.js";
import { findEntry, loadLedger, setIgMediaId } from "./ledger.js";

const GRAPH = "https://graph.instagram.com/v23.0";

interface PackageMeta {
  plan: { dateISO: string };
  mode: string;
  draft: { title: string };
}

/** out/<date>/ 패키지를 IG 캐러셀로 발행. 멱등(이미 발행 시 skip). */
export async function publishFromPackage(dateISO: string, dryRun = false): Promise<void> {
  const meta = JSON.parse(await readFile(`out/${dateISO}/draft.json`, "utf8")) as PackageMeta;
  if (meta.mode !== "auto") {
    console.log(`[publish] ${dateISO}는 mode=${meta.mode} — 발행하지 않습니다.`);
    return;
  }
  const ledger = await loadLedger();
  const entry = findEntry(ledger, dateISO);
  if (!entry) throw new Error(`ledger에 ${dateISO} 항목이 없습니다. 먼저 generate를 실행하세요.`);
  if (entry.igMediaId) {
    console.log(`[publish] ${dateISO}는 이미 발행됨 (${entry.igMediaId}) — skip`);
    return;
  }
  if (entry.images.length < 2 || entry.images.length > 10) {
    throw new Error(`캐러셀은 2~10장이어야 합니다 (현재 ${entry.images.length}장).`);
  }

  const caption = (await readFile(`out/${dateISO}/caption.txt`, "utf8")).trim();
  const urls = entry.images.map(rawUrl);

  console.log(`[publish] 이미지 URL 공개 확인 중 (${urls.length}장)...`);
  for (const url of urls) await waitPublic(url);

  if (dryRun) {
    console.log("[publish] --dry-run — 컨테이너 생성 전 중단. 발행 대상:");
    for (const url of urls) console.log(`  ${url}`);
    console.log(`caption ${caption.length}자`);
    return;
  }

  const token = requireEnv("IG_ACCESS_TOKEN");
  const userId = requireEnv("IG_USER_ID");

  console.log("[publish] 자식 컨테이너 생성...");
  const children: string[] = [];
  for (const url of urls) {
    const id = await igPost(`${userId}/media`, {
      image_url: url,
      is_carousel_item: "true",
      access_token: token,
    });
    await waitContainer(id, token);
    children.push(id);
  }

  console.log("[publish] 캐러셀 컨테이너 생성...");
  const parent = await igPost(`${userId}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption,
    access_token: token,
  });
  await waitContainer(parent, token);

  console.log("[publish] 발행...");
  const mediaId = await igPost(`${userId}/media_publish`, {
    creation_id: parent,
    access_token: token,
  });

  await setIgMediaId(dateISO, mediaId);
  console.log(`[publish] 완료 — media id ${mediaId}`);
}

/** POST → { id } */
async function igPost(path: string, params: Record<string, string>): Promise<string> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json()) as { id?: string; error?: { message: string; code: number } };
  if (!res.ok || !json.id) {
    throw new Error(`IG API ${path} 실패: ${json.error?.message ?? res.status}`);
  }
  return json.id;
}

/** 컨테이너 status_code 폴링 — FINISHED 외 상태는 실패 처리 */
async function waitContainer(id: string, token: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${GRAPH}/${id}?fields=status_code&access_token=${token}`);
    const json = (await res.json()) as { status_code?: string; error?: { message: string } };
    if (json.error) throw new Error(`컨테이너 ${id} 조회 실패: ${json.error.message}`);
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      throw new Error(`컨테이너 ${id} 상태: ${json.status_code}`);
    }
    await sleep(3000);
  }
  throw new Error(`컨테이너 ${id} 처리 타임아웃`);
}

/** raw.githubusercontent 전파 대기 — HEAD 200까지 최대 30초 */
async function waitPublic(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return;
    await sleep(3000);
  }
  throw new Error(`이미지가 공개되지 않았습니다: ${url}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
