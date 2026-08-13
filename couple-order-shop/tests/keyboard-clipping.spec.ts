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

/**
 * The runtime only lowers the keyboard when something asks it to. A field that
 * lives on a page rather than in a sheet had nothing doing the asking, so the
 * keyboard stayed up over the bottom navigation until an explicit button was
 * pressed — and the navigation was behind the keyboard.
 */
test("tapping away from a text field puts the keyboard away", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "我们", exact: true }).click();

  // The pairing code field lives on the page itself, not inside a sheet.
  await page.getByPlaceholder("输入 6 位情侣码").click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");

  await page.getByText("一人创建小铺，另一人输入情侣码加入").click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
});

test("the bottom navigation is never left behind the keyboard", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByPlaceholder("输入 6 位情侣码").click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");

  // Every tab must be tappable for real, not merely present in the DOM: with
  // the keyboard up it covered roughly 40% of the screen, nav included.
  // The bar animates up over the keyboard; measure where it comes to rest.
  const nav = page.locator(".bottom-nav");
  await expect(async () => {
    const bar = (await nav.boundingBox())!;
    const dock = (await page.getByTestId("keyboard-dock").boundingBox())!;
    expect(bar.y + bar.height, "the tab bar sits behind the keyboard").toBeLessThanOrEqual(dock.y + 1);
  }).toPass({ timeout: 4000 });

  for (const tab of ["小铺", "任务", "订单", "回忆", "我们"]) {
    await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
  }
});

test("changing page lowers a keyboard left open on the previous one", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByPlaceholder("输入 6 位情侣码").click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");

  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
});

/**
 * The symptom to guard: `data-visible` reads "false" while the dock is still
 * sitting over the page. Measured after the exit animation has had time to
 * finish, so a dock that stops halfway is a failure rather than a slow pass.
 */
test("a dismissed keyboard returns all the way to its parked position", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "我们", exact: true }).click();

  for (const dismiss of ["outside-tap", "page-change"] as const) {
    await page.getByPlaceholder("输入 6 位情侣码").click();
    await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
    if (dismiss === "outside-tap") await page.getByText("一人创建小铺，另一人输入情侣码加入").click();
    else await page.getByRole("button", { name: "回忆", exact: true }).click();
    await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");

    await page.waitForTimeout(800);
    const screen = (await page.getByTestId("device-screen").boundingBox())!;
    const dock = (await page.getByTestId("keyboard-dock").boundingBox())!;
    const intrusion = Math.round(Math.max(0, screen.y + screen.height - dock.y));
    expect(intrusion, `${dismiss} left ${intrusion}px of keyboard on screen`).toBeLessThanOrEqual(1);
    if (dismiss === "page-change") await page.getByRole("button", { name: "我们", exact: true }).click();
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
