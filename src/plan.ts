import { publishModeFor } from "./config.js";
import type { DayPlan, Topic } from "./topics/types.js";

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

export function planForDate(topic: Topic, dateISO: string, typeOverride?: string): DayPlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다: "${dateISO}"`);
  }
  if (typeOverride && !topic.types.includes(typeOverride)) {
    throw new Error(`[${topic.id}] --type은 ${topic.types.join("|")} 중 하나여야 합니다.`);
  }
  const [y, m, d] = dateISO.split("-").map(Number);
  // KST 자정 기준 요일 (UTC 정오로 만들면 타임존 밀림 없음)
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const type = typeOverride ?? topic.calendar[weekday];
  const mode = topic.modeOverrides[type] ?? publishModeFor(topic);
  return { dateISO, dateLabel: dateISO.replaceAll("-", "."), weekday, type, mode };
}
