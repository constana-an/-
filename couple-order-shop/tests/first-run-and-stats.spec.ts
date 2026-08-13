import { expect, test } from "@playwright/test";

const doneOrder = (id: string, createdAt: string) => ({
  id,
  itemId: "fruit-tea",
  itemName: "缤纷水果茶",
  price: 28,
  note: "",
  createdAt,
  desiredTime: "尽快",
  status: "done",
  from: "大宝",
  to: "二宝",
});

test("the first run explains the coin gap and hands over the first task", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();

  const guide = page.getByRole("dialog", { name: "三步开张你们的小铺" });
  await expect(guide).toBeVisible();
  await expect(guide.getByText("第 1 / 3 步")).toBeVisible();

  await page.getByRole("button", { name: "下一步" }).click();
  // A new wallet holds 8 coins and the cheapest wish costs 28: without this
  // sentence the shop reads as entirely locked.
  await expect(guide.getByText(/最便宜的心愿要 28 币/)).toBeVisible();

  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "去领第一个任务" }).click();
  await expect(page.getByRole("heading", { name: "我的今日任务" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("dialog", { name: "三步开张你们的小铺" })).toHaveCount(0);
});

test("the guide still opens inside the phone for a remembered identity", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-identity", "大宝");
  });
  await page.reload();

  // Regression: opening the sheet during the first render portalled it outside
  // the phone frame, because the screen element only exists after that commit.
  await expect(page.getByRole("dialog", { name: "三步开张你们的小铺" })).toBeVisible();
  const insideScreen = await page.evaluate(() => {
    const screen = document.querySelector('[data-testid="device-screen"]');
    const sheet = document.querySelector('[data-testid="bottom-sheet"]');
    return Boolean(screen && sheet && screen.contains(sheet));
  });
  expect(insideScreen).toBe(true);
});

test("the first-run guide can be skipped and stays dismissed", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /我是二宝/ }).click();
  await page.getByRole("button", { name: "先自己逛逛" }).click();

  await expect(page.getByRole("dialog", { name: "三步开张你们的小铺" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加入缤纷水果茶" })).toBeVisible();
});

test("the opening checklist carries the first run through to a real order", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-economy-version", "4");
    localStorage.setItem("couple-shop-coins:大宝", "200");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();

  const checklist = page.getByRole("region", { name: "开张进度" });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByText("身份：大宝")).toBeVisible();
  await expect(checklist.getByText("送出第一个心愿")).toBeVisible();

  // Sending one wish is what finishes the list, so it disappears afterwards.
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /确认下单/ }).click();
  await expect(checklist).toHaveCount(0);
});

test("the unconnected banner is the shortest route to pairing", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();

  // It used to only say "去「我们」页…" and leave the walking to the reader.
  await expect(page.getByText("点这里创建小铺或输入情侣码")).toBeVisible();
  await page.getByRole("button", { name: "去连接双人小铺", exact: true }).click();
  await expect(page.getByRole("button", { name: /小铺设置/ })).toBeVisible();
});

test("memories count this month in the hero and all time in its own tile", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((orders) => {
    localStorage.clear();
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem(
      "couple-shop-orders",
      JSON.stringify([{ ...orders.recent, createdAt: new Date().toISOString() }, orders.old]),
    );
  }, { recent: doneOrder("recent", ""), old: doneOrder("old", "2024-01-05T10:00:00.000Z") });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
  await page.getByRole("button", { name: "回忆", exact: true }).click();

  // Regression: the hero said "本月" while counting every completed order ever.
  await expect(page.locator(".memory-hero > strong")).toHaveText("1");
  await expect(page.locator(".stats-row div", { hasText: "累计完成" }).locator("strong")).toHaveText("2");
});
