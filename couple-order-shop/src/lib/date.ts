/**
 * All period keys (daily task refresh, weekly task refresh, check-in day) are
 * anchored to a single shop timezone instead of the device timezone or UTC.
 *
 * Why: the server grants rewards with `(now() at time zone APP_TIME_ZONE)::date`.
 * If the client derived its keys from `toISOString()` (UTC) or from the raw
 * device timezone, the two sides would disagree for part of every day and a
 * claimed task would render as unclaimed — or, in local mode, a weekly task
 * could be claimed twice in one week.
 */
export const APP_TIME_ZONE = "Asia/Shanghai";

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The `YYYY-MM-DD` calendar day of `value` in the shop timezone. */
export function dateKey(value: Date = new Date()): string {
  return dayKeyFormatter.format(value);
}

export function todayKey(): string {
  return dateKey();
}

/** Parses `YYYY-MM-DD` into a UTC-midnight anchor for calendar-only math. */
function anchorOf(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const anchor = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(anchor.getTime()) ? null : anchor;
}

/** The Monday of `value`'s week, as `YYYY-MM-DD` in the shop timezone. */
export function weekKey(value: Date = new Date()): string {
  const anchor = anchorOf(dateKey(value))!;
  const weekday = anchor.getUTCDay() || 7;
  anchor.setUTCDate(anchor.getUTCDate() - weekday + 1);
  return anchor.toISOString().slice(0, 10);
}

export function isValidDateKey(key: string): boolean {
  const anchor = anchorOf(key);
  return anchor !== null && anchor.toISOString().slice(0, 10) === key;
}

/** Whole days between two `YYYY-MM-DD` keys (`to - from`). */
export function daysBetween(fromKey: string, toKey: string): number {
  const from = anchorOf(fromKey);
  const to = anchorOf(toKey);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Day 1 is the start date itself, so a couple is never on "day 0". */
export function relationshipDays(startedOn: string): number {
  if (!isValidDateKey(startedOn)) return 1;
  return Math.max(1, daysBetween(startedOn, todayKey()) + 1);
}

export function formatStartedOn(startedOn: string): string {
  const [year, month, day] = startedOn.split("-");
  return year && month && day ? `${year} 年 ${Number(month)} 月 ${Number(day)} 日` : "尚未设置";
}

/** Progressively formats digits typed into a date field as `YYYY-MM-DD`. */
export function normalizeDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function daysUntilAnniversary(eventDate: string, repeatsYearly: boolean): number {
  const source = anchorOf(eventDate);
  const today = anchorOf(todayKey());
  if (!source || !today) return 0;
  let target = source;
  if (repeatsYearly) {
    target = new Date(Date.UTC(today.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
    if (target < today) target = new Date(Date.UTC(today.getUTCFullYear() + 1, source.getUTCMonth(), source.getUTCDate()));
  }
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}

export function relativeTime(value: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

/**
 * Rough "how long do we have to save" hint. Assumes the couple earns around
 * 6 coins a day at partial participation, which is unchanged by the per-person
 * task split because each side now earns half of the old single-side reward.
 */
export function savingHint(price: number): string {
  const days = Math.ceil(price / 6);
  if (days <= 7) return `约攒 ${Math.max(3, days)} 天`;
  return `约攒 ${Math.ceil(days / 7)} 周`;
}
