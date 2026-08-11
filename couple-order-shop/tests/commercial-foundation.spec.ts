import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
});

test("account center exposes permanent login, recovery, phone and Apple paths", async ({ page }) => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /登录或注册账户|升级试用账户/ }).click();

  await expect(page.getByRole("dialog", { name: /创建正式账户|登录账户/ })).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
  await expect(page.getByLabel("密码")).toBeVisible();
  await expect(page.getByRole("button", { name: /手机号/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Apple/ })).toBeVisible();

  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "忘记密码？找回账户" }).click();
  await expect(page.getByRole("dialog", { name: "找回账户" })).toBeVisible();
  await expect(page.getByRole("button", { name: "发送重置邮件" })).toBeVisible();
});

test("memories include check-in, private photo and anniversary entry points", async ({ page }) => {
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.getByText("连续签到")).toBeVisible();
  await expect(page.getByRole("button", { name: "签到 +1" })).toBeVisible();

  await page.getByRole("button", { name: /收藏第一张合照/ }).click();
  await expect(page.getByRole("dialog", { name: "收藏照片回忆" })).toBeVisible();
  await expect(page.getByLabel("这张照片的故事")).toBeVisible();
  await page.getByRole("dialog").press("Escape");

  await page.getByRole("button", { name: "添加", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "添加纪念日" })).toBeVisible();
  await expect(page.getByLabel("纪念日名称")).toBeVisible();
});

test("privacy center explains security and data portability", async ({ page }) => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /隐私协议与账户安全/ }).click();

  await expect(page.getByRole("dialog", { name: "隐私与账户安全" })).toBeVisible();
  await expect(page.getByText("订单、任务、签到", { exact: true })).toBeVisible();
  await expect(page.getByText("关键操作留痕")).toBeVisible();
  await expect(page.getByRole("button", { name: "导出我的数据" })).toBeVisible();
});
