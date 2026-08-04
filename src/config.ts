import type { ContentType, PublishMode } from "./types.js";

export const BRAND = process.env.BRAND ?? "ANI·CARDS";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350; // 4:5
export const JPEG_QUALITY = 92;

/** 요일(0=일) → 콘텐츠 타입 */
export const CALENDAR: Record<number, ContentType> = {
  1: "trending", // 월: 주간 인기 TOP 5
  2: "classic", //  화: 명작 추천
  3: "news", //     수: 주간 애니 뉴스 다이제스트
  4: "quote", //    목: 명대사 카드
  5: "seasonal", // 금: 신작 스포트라이트 (1/4/7/10월 첫 금요일은 라인업 스페셜)
  6: "classic", //  토: 정주행 추천
  0: "schedule", // 일: 다음주 방영 일정
};

export const TYPE_LABELS: Record<ContentType, string> = {
  trending: "주간 인기",
  classic: "명작 추천",
  news: "애니 뉴스",
  quote: "명대사",
  seasonal: "신작",
  schedule: "방영 일정",
};

/** 오보 리스크가 있는 타입은 auto 모드여도 리뷰로 강제 */
export const TYPE_MODE_OVERRIDES: Partial<Record<ContentType, PublishMode>> = {
  news: "review",
};

export const PUBLISH_MODE: PublishMode =
  process.env.PUBLISH_MODE === "auto" ? "auto" : "review";

/** 코드가 캡션 말미에 강제로 붙이는 출처/정책 문구 (writer 누락 불가) */
export const ATTRIBUTION_FOOTER =
  "이미지: 각 작품 공식 커버 아트 ⓒ 해당 작품 제작위원회 (via AniList)\n" +
  "권리자 요청 시 즉시 삭제합니다.";
