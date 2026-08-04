import { CALENDAR, PUBLISH_MODE, TYPE_MODE_OVERRIDES } from "./config.js";
import type { ContentType, PublishMode } from "./types.js";

export interface DayPlan {
  dateISO: string; //   "2026-08-04" (KST)
  dateLabel: string; // "2026.08.04"
  weekday: number; //   0=일
  type: ContentType;
  /** 1/4/7/10월 첫 금요일 → 분기 신작 라인업 스페셜 */
  seasonalSpecial: boolean;
  mode: PublishMode;
}

const KST_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** now 기준 KST 날짜 문자열 "YYYY-MM-DD" */
export function todayKST(now = new Date()): string {
  return KST_FMT.format(now);
}

export function planForDate(dateISO: string, typeOverride?: ContentType): DayPlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다: "${dateISO}"`);
  }
  const [y, m, d] = dateISO.split("-").map(Number);
  // KST 자정 기준 요일 (UTC 정오로 만들면 타임존 밀림 없음)
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const type = typeOverride ?? CALENDAR[weekday];
  const seasonalSpecial =
    type === "seasonal" && weekday === 5 && [1, 4, 7, 10].includes(m) && d <= 7;
  const mode = TYPE_MODE_OVERRIDES[type] ?? PUBLISH_MODE;
  return {
    dateISO,
    dateLabel: dateISO.replaceAll("-", "."),
    weekday,
    type,
    seasonalSpecial,
    mode,
  };
}

/** AniList 시즌: 1-3 WINTER / 4-6 SPRING / 7-9 SUMMER / 10-12 FALL */
export function currentSeason(dateISO: string): { season: string; seasonYear: number } {
  const [y, m] = dateISO.split("-").map(Number);
  const season = m <= 3 ? "WINTER" : m <= 6 ? "SPRING" : m <= 9 ? "SUMMER" : "FALL";
  return { season, seasonYear: y };
}

/** 다음 주 월~일의 KST 자정 Unix 초 범위 (schedule 타입용) */
export function nextWeekRangeKST(dateISO: string): { startSec: number; endSec: number } {
  const [y, m, d] = dateISO.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  const daysToNextMon = ((8 - base.getUTCDay()) % 7) || 7;
  const monday = new Date(Date.UTC(y, m - 1, d + daysToNextMon));
  // KST 자정 = UTC 전날 15:00
  const startSec = monday.getTime() / 1000 - 9 * 3600;
  return { startSec, endSec: startSec + 7 * 86400 };
}
