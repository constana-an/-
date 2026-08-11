import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_TIME_ZONE,
  dateKey,
  daysBetween,
  daysUntilAnniversary,
  formatStartedOn,
  isValidDateKey,
  normalizeDateInput,
  relationshipDays,
  savingHint,
  todayKey,
  weekKey,
} from "../src/lib/date.ts";

// 2026-08-12T19:00:00Z is 03:00 on Thursday 2026-08-13 in Asia/Shanghai.
const earlyMorning = new Date("2026-08-12T19:00:00Z");
// 2026-08-13T04:00:00Z is 12:00 on the same Thursday.
const midday = new Date("2026-08-13T04:00:00Z");

test("day keys follow the shop timezone, not UTC", () => {
  assert.equal(APP_TIME_ZONE, "Asia/Shanghai");
  assert.equal(dateKey(earlyMorning), "2026-08-13");
  assert.equal(dateKey(midday), "2026-08-13");
});

test("the day key is stable across the whole shop day", () => {
  assert.equal(dateKey(earlyMorning), dateKey(midday));
});

test("week keys resolve to Monday at every hour of the day", () => {
  // Regression: deriving the key from toISOString() returned the *Sunday*
  // before 08:00 local, so a claimed weekly task rendered as unclaimed and
  // could be claimed a second time in the same week.
  assert.equal(weekKey(earlyMorning), "2026-08-10");
  assert.equal(weekKey(midday), "2026-08-10");
});

test("week keys agree with Postgres date_trunc('week') at week edges", () => {
  // Monday 2026-08-10 00:30 Shanghai is still 2026-08-09 in UTC.
  assert.equal(weekKey(new Date("2026-08-09T16:30:00Z")), "2026-08-10");
  // Sunday 2026-08-09 23:30 Shanghai belongs to the previous week.
  assert.equal(weekKey(new Date("2026-08-09T15:30:00Z")), "2026-08-03");
});

test("date keys are validated strictly", () => {
  assert.equal(isValidDateKey("2024-05-20"), true);
  assert.equal(isValidDateKey("2024-02-30"), false);
  assert.equal(isValidDateKey("2024-5-20"), false);
  assert.equal(isValidDateKey(""), false);
  assert.equal(isValidDateKey("not-a-date"), false);
});

test("daysBetween counts whole calendar days across a month boundary", () => {
  assert.equal(daysBetween("2026-08-10", "2026-08-13"), 3);
  assert.equal(daysBetween("2026-07-31", "2026-08-01"), 1);
  assert.equal(daysBetween("2026-08-13", "2026-08-10"), -3);
});

test("the first day together counts as day 1", () => {
  assert.equal(relationshipDays(todayKey()), 1);
  assert.equal(relationshipDays("not-a-date"), 1);
  const yesterday = dateKey(new Date(Date.now() - 86_400_000));
  assert.equal(relationshipDays(yesterday), 2);
});

test("anniversary countdown is measured in shop-timezone days", () => {
  const today = todayKey();
  const tomorrow = dateKey(new Date(Date.now() + 86_400_000));
  assert.equal(daysUntilAnniversary(today, true), 0);
  assert.equal(daysUntilAnniversary(tomorrow, true), 1);
  assert.equal(daysUntilAnniversary("not-a-date", true), 0);
});

test("a past one-off anniversary never reports a negative countdown", () => {
  assert.equal(daysUntilAnniversary("2020-01-01", false), 0);
});

test("typed digits become a YYYY-MM-DD draft", () => {
  assert.equal(normalizeDateInput("2024"), "2024");
  assert.equal(normalizeDateInput("202405"), "2024-05");
  assert.equal(normalizeDateInput("20240520"), "2024-05-20");
  assert.equal(normalizeDateInput("2024/05/20"), "2024-05-20");
  assert.equal(normalizeDateInput("2024052099"), "2024-05-20");
});

test("start dates render as Chinese copy", () => {
  assert.equal(formatStartedOn("2024-05-20"), "2024 年 5 月 20 日");
  assert.equal(formatStartedOn(""), "尚未设置");
});

test("saving hints scale from days to weeks", () => {
  assert.equal(savingHint(28), "约攒 5 天");
  assert.equal(savingHint(12), "约攒 3 天");
  assert.equal(savingHint(360), "约攒 9 周");
});
