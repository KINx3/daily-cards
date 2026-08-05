import type { Topic } from "./topics/types.js";
import type { PublishMode } from "./types.js";

// 로컬 실행 시 .env 자동 로드 (없으면 무시; CI는 Actions env 사용)
try {
  process.loadEnvFile(".env");
} catch {}

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350; // 4:5
export const JPEG_QUALITY = 92;

/** 포스트 패키지 디렉토리 — 슬롯 1은 기존 경로 유지(이미 발행된 raw URL·이슈 호환), 2부터 접미사 */
export function pkgDir(topicId: string, dateISO: string, slot: number): string {
  return `out/${topicId}/${dateISO}${slot > 1 ? `-${slot}` : ""}`;
}

/** 토픽별 브랜드: BRAND_<TOPIC> > BRAND > 토픽 기본값 (빈 문자열은 미설정 취급) */
export function brandFor(topic: Topic): string {
  return (
    process.env[`BRAND_${topic.id.toUpperCase()}`] || process.env.BRAND || topic.defaultBrand
  );
}

/** 토픽별 발행 모드: PUBLISH_MODE_<TOPIC> > PUBLISH_MODE > review */
export function publishModeFor(topic: Topic): PublishMode {
  const v =
    process.env[`PUBLISH_MODE_${topic.id.toUpperCase()}`] ?? process.env.PUBLISH_MODE;
  return v === "auto" ? "auto" : "review";
}
