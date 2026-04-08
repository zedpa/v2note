/**
 * 下拉刷新 E2E 测试
 *
 * 覆盖 spec: specs/app-mobile-views.md 场景 3.1b-3.1f + 验收行为 E6-E9
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/pull-to-refresh.spec.ts --headed --reporter=list
 */
import { test, expect, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

// ── Helpers ──────────────────────────────────────────────────────

async function waitForIdle(page: Page, ms = 1000) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** 导航到日记视图并等待加载 */
async function goToDiary(page: Page) {
  await page.goto("/");
  await waitForIdle(page);
  const diaryTab = page.getByText("日记");
  if (await diaryTab.isVisible()) {
    await diaryTab.click();
    await waitForIdle(page, 500);
  }
}

/** 导航到待办视图 */
async function goToTodo(page: Page) {
  await page.goto("/");
  await waitForIdle(page);
  const todoTab = page.getByText("待办");
  if (await todoTab.isVisible()) {
    await todoTab.click();
    await waitForIdle(page, 500);
  }
}

/** 模拟下拉刷新手势：从 startY 向下拖拽 distance px */
async function pullDown(page: Page, distance: number, startY = 150) {
  const centerX = 195; // viewport 390 / 2
  await page.touchscreen.tap(centerX, startY);
  // touchmove 模拟
  await page.evaluate(
    ({ x, sy, dist }) => {
      const el = document.querySelector("main");
      if (!el) return;
      const steps = 10;
      const stepDist = dist / steps;
      // touchstart
      el.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: sy })],
        }),
      );
      // touchmove steps
      for (let i = 1; i <= steps; i++) {
        el.dispatchEvent(
          new TouchEvent("touchmove", {
            bubbles: true,
            touches: [
              new Touch({ identifier: 1, target: el, clientX: x, clientY: sy + stepDist * i }),
            ],
          }),
        );
      }
      // touchend
      el.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          changedTouches: [
            new Touch({ identifier: 1, target: el, clientX: x, clientY: sy + dist }),
          ],
        }),
      );
    },
    { x: centerX, sy: startY, dist: distance },
  );
}

// ══════════════════════════════════════════════════════════════════
// E6: 日记视图下拉刷新
// ══════════════════════════════════════════════════════════════════

test.describe("E6: 日记视图下拉刷新", () => {
  test("下拉超过阈值应显示刷新指示器并重新加载数据", async ({ page }) => {
    await goToDiary(page);

    // 确保在顶部
    await page.evaluate(() => {
      document.querySelector("main")?.scrollTo(0, 0);
    });

    // 执行下拉手势（超过 64px 阈值，阻尼 0.4 需要拖 200px 以触发）
    await pullDown(page, 200);

    // 应显示刷新指示器
    const indicator = page.locator("[data-testid='pull-refresh-indicator']");
    await expect(indicator).toBeVisible({ timeout: 2000 });

    // 等待刷新完成，指示器消失
    await expect(indicator).toBeHidden({ timeout: 15000 });
  });
});

// ══════════════════════════════════════════════════════════════════
// E7: 待办视图下拉刷新
// ══════════════════════════════════════════════════════════════════

test.describe("E7: 待办视图下拉刷新", () => {
  test("待办视图下拉超过阈值应显示刷新指示器", async ({ page }) => {
    await goToTodo(page);

    await page.evaluate(() => {
      document.querySelector("main")?.scrollTo(0, 0);
    });

    await pullDown(page, 200);

    const indicator = page.locator("[data-testid='pull-refresh-indicator']");
    await expect(indicator).toBeVisible({ timeout: 2000 });
    await expect(indicator).toBeHidden({ timeout: 15000 });
  });
});

// ══════════════════════════════════════════════════════════════════
// E8: 非顶部位置不触发
// ══════════════════════════════════════════════════════════════════

test.describe("E8: 非顶部不触发下拉刷新", () => {
  test("页面滚动后下拉不应显示刷新指示器", async ({ page }) => {
    await goToDiary(page);

    // 向下滚动一段距离
    await page.evaluate(() => {
      document.querySelector("main")?.scrollTo(0, 300);
    });
    await page.waitForTimeout(200);

    await pullDown(page, 200, 300);

    const indicator = page.locator("[data-testid='pull-refresh-indicator']");
    await expect(indicator).toBeHidden({ timeout: 1000 });
  });
});

// ══════════════════════════════════════════════════════════════════
// E9: 下拉刷新网络失败
// ══════════════════════════════════════════════════════════════════

test.describe("E9: 下拉刷新网络失败", () => {
  test("网络错误时应显示错误提示并保留现有数据", async ({ page }) => {
    await goToDiary(page);

    // 记录当前列表项数量
    const cardsBefore = await page.locator("[data-testid='timeline-card']").count();

    // 拦截 API 请求，模拟网络错误
    await page.route("**/api/records**", (route) => route.abort("failed"));

    await page.evaluate(() => {
      document.querySelector("main")?.scrollTo(0, 0);
    });

    await pullDown(page, 200);

    // 等待指示器出现并消失
    const indicator = page.locator("[data-testid='pull-refresh-indicator']");
    await expect(indicator).toBeHidden({ timeout: 15000 });

    // 应显示错误提示 Toast
    await expect(page.getByText(/刷新失败/)).toBeVisible({ timeout: 3000 });

    // 列表数据应保持不变
    const cardsAfter = await page.locator("[data-testid='timeline-card']").count();
    expect(cardsAfter).toBe(cardsBefore);

    // 清理路由拦截
    await page.unroute("**/api/records**");
  });
});
