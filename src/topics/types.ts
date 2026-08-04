import type { ImageMap, PostDraft, PublishMode } from "../types.js";

export interface DayPlan {
  dateISO: string; //   "2026-08-04" (KST)
  dateLabel: string; // "2026.08.04"
  weekday: number; //   0=일
  type: string; //      토픽별 콘텐츠 타입
  mode: PublishMode;
}

/** 토픽별 dedup 뷰 — featured 문자열 id 기준 */
export interface LedgerViews {
  /** 최근 30일 피처링 (작품·리포 등 순환 소재) */
  recent: Set<string>;
  /** 전체 이력 (명언·뉴스 guid 등 무반복 소재) */
  all: Set<string>;
}

export interface Prepared {
  /** writer(user turn)에 직렬화되는 데이터 */
  payload: unknown;
  images: ImageMap;
  /** ledger에 기록할 dedup 키 목록 */
  featured: string[];
  /** 인용 원문 강제 주입(writer 출력 미신뢰) — kind=quote 슬라이드에 적용 */
  quoteOverride?: { body: string; heading: string; subheading: string };
  /** 미검수 인용 등 — 리뷰 모드 강제 */
  forceReview?: boolean;
}

/** 카드 컬러 테마 (card.html CSS 변수 오버라이드) */
export interface TopicTheme {
  accent: string;
  accentSoft: string;
  accent2: string;
  highlight: string;
  gradTitle: string;
  glowA: string;
  glowB: string;
  badgeGrad: string;
}

export interface Topic {
  id: string;
  defaultBrand: string;
  types: readonly string[];
  /** 요일(0=일) → 콘텐츠 타입 */
  calendar: Record<number, string>;
  typeLabels: Record<string, string>;
  /** auto 모드여도 리뷰로 강제할 타입 */
  modeOverrides: Partial<Record<string, PublishMode>>;
  /** 코드가 캡션 말미에 강제로 붙이는 출처/정책 문구 */
  attribution: string;
  theme: TopicTheme;
  /** 엔진 공통 writer 규칙 뒤에 붙는 토픽 규칙/톤 */
  writerSystemExtra: string;
  typeGuides: Record<string, string>;
  prepare(plan: DayPlan, views: LedgerViews): Promise<Prepared>;
  /** Claude 없이 만드는 결정적 초안 (테스트·writer 장애 대체) */
  fixture(plan: DayPlan, prepared: Prepared): PostDraft;
}
