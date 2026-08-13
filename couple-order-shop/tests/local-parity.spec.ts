import { expect, test } from "@playwright/test";

/** The shop day key, in the shop timezone — mirrors src/lib/date.ts. */
const shopDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offsetDays * 86_400_000));

const enterAs = async (page: import("@playwright/test").Page, who: "大宝" | "二宝", seed: Record<string, string> = {}) => {
  await page.goto("/");
  await page.evaluate((entries) => {
    localStorage.clear();
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-economy-version", "4");
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, seed);
  await page.reload();
  await page.getByRole("button", { name: new RegExp(`我是${who}`) }).click();
};

const switchIdentity = async (page: import("@playwright/test").Page, to: "大宝" | "二宝") => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /当前身份/ }).click();
  await page.getByRole("button", { name: new RegExp(`我是${to}`) }).click();
};

const coinBalance = async (page: import("@playwright/test").Page) =>
  Number(await page.locator(".coin-count strong").innerText());

test("checking in works offline and pays into that identity's own wallet", async ({ page }) => {
  await enterAs(page, "大宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  expect(await coinBalance(page)).toBe(8);

  await page.getByRole("button", { name: "签到 +1" }).click();
  await expect(page.getByText("连续签到 1 天，甜心币 +1")).toBeVisible();
  // Regression: this used to force open a login sheet that could never succeed
  // when the build carries no Supabase configuration.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".checkin-card strong")).toHaveText("1 天");
  await expect(page.getByRole("button", { name: "今日已签" })).toBeDisabled();
  expect(await coinBalance(page)).toBe(9);

  await page.reload();
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".checkin-card strong")).toHaveText("1 天");
  expect(await coinBalance(page)).toBe(9);

  // The other identity has their own streak and their own coin.
  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".checkin-card strong")).toHaveText("0 天");
  await expect(page.getByRole("button", { name: "签到 +1" })).toBeEnabled();
  expect(await coinBalance(page)).toBe(8);

  await switchIdentity(page, "大宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".checkin-card strong")).toHaveText("1 天");
});

test("a streak counts back from yesterday when today is not claimed yet", async ({ page }) => {
  await enterAs(page, "大宝", {
    "couple-shop-checkins:大宝": JSON.stringify([shopDay(-1), shopDay(-2)]),
  });
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  // Matches public.checkin_streak: an unclaimed today does not break the run.
  await expect(page.locator(".checkin-card strong")).toHaveText("2 天");
  await expect(page.getByRole("button", { name: "签到 +1" })).toBeEnabled();

  await page.getByRole("button", { name: "签到 +1" }).click();
  await expect(page.getByText("连续签到 3 天，甜心币 +1")).toBeVisible();
});

test("anniversaries can be kept, edited and deleted without a cloud", async ({ page }) => {
  await enterAs(page, "大宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await page.getByRole("button", { name: /添加第一个纪念日/ }).click();

  await page.getByLabel("纪念日名称").fill("第一次见面");
  await page.getByLabel("日期").fill("2024-05-20");
  await page.getByRole("button", { name: "7 天", exact: true }).click();
  await page.getByRole("button", { name: "保存纪念日" }).click();
  await expect(page.getByText("纪念日已保存，将提前 7 天提醒")).toBeVisible();

  const row = page.locator(".anniversary-list button", { hasText: "第一次见面" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/每年重复 · 提前 7 天提醒/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".anniversary-list button", { hasText: "第一次见面" })).toBeVisible();

  await page.getByRole("button", { name: "管理" }).click();
  await page.getByLabel("纪念日名称").fill("我们第一次见面");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("纪念日已更新")).toBeVisible();
  await expect(page.locator(".anniversary-list button", { hasText: "我们第一次见面" })).toBeVisible();

  await page.getByRole("button", { name: "管理" }).click();
  await page.getByRole("button", { name: /删除这个纪念日/ }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("button", { name: /添加第一个纪念日/ })).toBeVisible();
});

test("an allowed but unsubscribed device does not claim it will be pushed", async ({ page }) => {
  // A device where the OS permission is already granted, which is all the old
  // code ever looked at.
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "granted", configurable: true });
  });
  await enterAs(page, "大宝");
  await page.getByRole("button", { name: "我们", exact: true }).click();

  // Regression: this row read 已开启 / 订单不会错过 off the permission alone, on
  // a device with no push subscription and no couple to be pushed from.
  const row = page.locator(".setting-row", { hasText: "实时消息通知" });
  await expect(row).toBeVisible();
  await expect(row.getByText("已允许通知；连接双人小铺后才会推送")).toBeVisible();
  await expect(row.getByText("仅本机")).toBeVisible();
  await expect(row.getByText("订单不会错过")).toHaveCount(0);
});

test("a finished wish lands on the memory timeline by itself", async ({ page }) => {
  await enterAs(page, "大宝", { "couple-shop-coins:大宝": "200" });
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.getByText("完成一个心愿，它就会自己出现在这条时间线上")).toBeVisible();

  await page.getByRole("button", { name: "小铺", exact: true }).click();
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /确认下单/ }).click();
  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /接单/ }).click();
  await page.getByRole("button", { name: /开始准备/ }).click();
  await page.getByRole("button", { name: /完成心愿/ }).click();

  // No "save it" step: the onboarding promised this happens on its own.
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  const entry = page.locator(".memory-timeline li", { hasText: "缤纷水果茶" });
  await expect(entry).toBeVisible();
  await expect(entry.getByText("二宝 完成了 大宝 点的")).toBeVisible();
});

test("the album explains itself instead of dead-ending", async ({ page }) => {
  await enterAs(page, "大宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();

  await expect(page.getByText(/照片回忆需要双人空间|本地体验模式没有相册/)).toBeVisible();
  await expect(page.getByText("请先登录并连接双人小铺")).toHaveCount(0);

  // With Supabase configured but unpaired, the card routes to where pairing is.
  await page.locator(".locked-section").getByRole("button", { name: "去连接双人小铺" }).click();
  await expect(page.getByRole("button", { name: /小铺设置/ })).toBeVisible();
  await expect(page.getByText("连接两台 iPhone")).toBeVisible();
});
