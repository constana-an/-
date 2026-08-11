import { expect, test } from "@playwright/test";

const startWithCoins = async (page: import("@playwright/test").Page, coins: number) => {
  await page.goto("/");
  await page.evaluate((value) => {
    localStorage.clear();
    localStorage.setItem("couple-shop-economy-version", "3");
    localStorage.setItem("couple-shop-coins", String(value));
  }, coins);
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
};

const coinBalance = async (page: import("@playwright/test").Page) =>
  Number(await page.locator(".coin-count strong").innerText());

test("the bottom navigation sits above the home indicator, not over the status bar", async ({ page }) => {
  await startWithCoins(page, 8);
  const nav = page.locator(".bottom-nav");
  await expect(nav).toBeVisible();
  const navBox = (await nav.boundingBox())!;
  const screenBox = (await page.getByTestId("device-screen").boundingBox())!;
  // Regression: --mobile-safe-area-height is defined on .mobile-page, which the
  // nav is not inside. When it failed to resolve, `bottom` fell back to `auto`
  // and the nav rendered at the top of the screen over the status bar.
  expect(navBox.y).toBeGreaterThan(screenBox.y + screenBox.height * 0.6);
  expect(navBox.y + navBox.height).toBeLessThanOrEqual(screenBox.y + screenBox.height);
});

test("the sender cannot answer their own order and a decline refunds the coins", async ({ page }) => {
  await startWithCoins(page, 200);
  const before = await coinBalance(page);

  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /确认下单/ }).click();
  await page.getByRole("button", { name: "订单", exact: true }).click();

  await expect(page.getByText("等 二宝 接单，婉拒会退回甜心币")).toBeVisible();
  await expect(page.getByRole("button", { name: /接单/ })).toHaveCount(0);
  expect(await coinBalance(page)).toBe(before - 28);

  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /当前身份/ }).click();
  await page.getByRole("button", { name: /我是二宝/ }).click();
  await page.getByRole("button", { name: "订单", exact: true }).click();

  await page.getByRole("button", { name: /婉拒/ }).click();
  await expect(page.getByText("已婉拒，28 甜心币退回小铺")).toBeVisible();
  expect(await coinBalance(page)).toBe(before);
});

test("a spent limited coupon stays visibly used", async ({ page }) => {
  await startWithCoins(page, 200);
  await page.getByRole("button", { name: "限定券" }).click();
  await page.getByRole("button", { name: "加入今天吃什么我决定" }).click();
  await page.getByRole("button", { name: /确认下单/ }).click();

  const card = page.locator(".menu-card", { hasText: "今天吃什么我决定" });
  await expect(card.getByText("已使用")).toBeVisible();
  await expect(card.getByRole("button", { name: /已使用/ })).toBeDisabled();
});

test("saving the shop profile dismisses the simulated keyboard", async ({ page }) => {
  await startWithCoins(page, 8);
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /小铺设置/ }).click();
  await page.getByLabel("小铺名称").fill("我们的周末小铺");
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");

  await page.getByRole("button", { name: "保存小铺资料", exact: true }).click();
  // A keyboard left standing after the sheet closes covers the bottom nav.
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.getByText("相爱天数")).toBeVisible();
});
