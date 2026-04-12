import { test, expect } from "@playwright/test";

/**
 * E2E: fix-onboarding-step2-guide
 * 冷启动第二步改为聚焦操作引导（Coach Mark）
 */

test.describe("Onboarding Coach Mark Guide", () => {
  test.beforeEach(async ({ page }) => {
    // 清除 onboarding 标记，模拟新用户
    await page.evaluate(() => {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("v2note:onboarded") || k.startsWith("v2note:guide-done")) {
          localStorage.removeItem(k);
        }
      });
    });
  });

  test("S1: 输入名字后直接进入主界面并触发聚焦引导", async ({ page }) => {
    await page.goto("/");
    // Step 1: 输入名字
    const nameInput = page.locator('input[placeholder*="名字"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("测试用户");
    await page.locator("button", { hasText: "下一步" }).click();

    // 应该直接进入主界面（不再有 Step 2 textarea）
    // Coach Mark 遮罩应出现
    const overlay = page.locator("[data-testid='coach-mark-overlay']");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // FAB 区域应被高亮，引导文案可见
    const message = page.locator("[data-testid='coach-mark-message']");
    await expect(message).toContainText("说话");
  });

  test("S2: 点击前进到下一步引导", async ({ page }) => {
    await page.goto("/");
    const nameInput = page.locator('input[placeholder*="名字"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("测试用户");
    await page.locator("button", { hasText: "下一步" }).click();

    // 等待第一步引导
    const overlay = page.locator("[data-testid='coach-mark-overlay']");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // 点击前进
    await overlay.click();

    // 第二步引导文案：待办相关
    const message = page.locator("[data-testid='coach-mark-message']");
    await expect(message).toContainText("待办");
  });

  test("S3: 完成所有引导步骤后遮罩消失", async ({ page }) => {
    await page.goto("/");
    const nameInput = page.locator('input[placeholder*="名字"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("测试用户");
    await page.locator("button", { hasText: "下一步" }).click();

    const overlay = page.locator("[data-testid='coach-mark-overlay']");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // 点击两次完成两步引导
    await overlay.click();
    await page.waitForTimeout(300);
    await overlay.click();

    // 遮罩应消失
    await expect(overlay).not.toBeVisible({ timeout: 3000 });
  });

  test("S5: 引导完成后刷新不再触发", async ({ page }) => {
    await page.goto("/");
    const nameInput = page.locator('input[placeholder*="名字"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("测试用户");
    await page.locator("button", { hasText: "下一步" }).click();

    const overlay = page.locator("[data-testid='coach-mark-overlay']");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // 完成引导
    await overlay.click();
    await page.waitForTimeout(300);
    await overlay.click();
    await expect(overlay).not.toBeVisible({ timeout: 3000 });

    // 刷新页面
    await page.reload();
    await page.waitForTimeout(2000);

    // 不应再出现引导
    await expect(overlay).not.toBeVisible();
  });
});
