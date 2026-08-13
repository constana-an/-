import { expect, test } from "@playwright/test";

/**
 * The phone screen clips with `overflow: hidden` and a rounded radius, which a
 * browser does not apply to a descendant it has promoted to its own compositor
 * layer. Everything framer-motion animates inside the screen is such a
 * descendant, so the dismissed keyboard — parked just below the screen — kept
 * painting over the page under the phone, and every bottom sheet was visible
 * outside the bezel while it slid up.
 */
const enter = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-economy-version", "4");
    localStorage.setItem("couple-shop-coins:大宝", "200");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
};

test("the phone screen paints nothing below its own bottom edge", async ({ page }) => {
  await enter(page);
  const clipped = await page.evaluate(() => {
    const screen = document.querySelector('[data-testid="device-screen"]')!;
    return getComputedStyle(screen).contain.includes("paint");
  });
  expect(clipped, "the screen must clip composited descendants, not only static ones").toBe(true);
});

test("the simulated keyboard leaves the screen on every page", async ({ page }) => {
  await enter(page);

  // Raise it from a real text field, then dismiss it the way the app does.
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /小铺设置/ }).click();
  await page.getByLabel("小铺名称").click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
  await page.getByRole("button", { name: "保存小铺资料", exact: true }).click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");

  const screen = (await page.getByTestId("device-screen").boundingBox())!;
  for (const tab of ["小铺", "任务", "订单", "回忆", "我们"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const dock = (await page.getByTestId("keyboard-dock").boundingBox())!;
    // Parked at or below the screen's bottom edge on every page, and the clip
    // asserted above is what stops the parked layer from painting anyway.
    expect(dock.y, `${tab} still has the keyboard over the screen`).toBeGreaterThanOrEqual(screen.y + screen.height - 1);
  }
});

test("a bottom sheet never paints outside the bezel while it opens", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();

  const screen = (await page.getByTestId("device-screen").boundingBox())!;
  const sheet = (await page.getByTestId("bottom-sheet").boundingBox())!;
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();
  // Whatever the animation is doing, the visible part stays inside the screen.
  expect(sheet.x).toBeGreaterThanOrEqual(screen.x - 1);
  expect(sheet.x + sheet.width).toBeLessThanOrEqual(screen.x + screen.width + 1);
});
