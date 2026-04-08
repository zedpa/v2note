/**
 * 日记卡片布局重构 E2E 测试
 *
 * 覆盖 spec: specs/app-mobile-views.md 场景 3.3/3.4/3.7/3.8 + 验收行为 E1-E5
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/diary-card-layout.spec.ts --headed --reporter=list
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
  // 确保在日记 tab
  const diaryTab = page.getByText("日记");
  if (await diaryTab.isVisible()) {
    await diaryTab.click();
    await waitForIdle(page, 500);
  }
}

// ══════════════════════════════════════════════════════════════════
// E1: 语音日记卡片 — 录音条与原文展开
// ══════════════════════════════════════════════════════════════════

test.describe("E1: 语音日记 — 录音卡片与原文", () => {
  test("语音卡片折叠态应显示录音条和「原文」按钮", async ({ page }) => {
    await goToDiary(page);

    // 找到包含音频播放器的卡片
    const audioCard = page.locator("[data-testid='timeline-card']").filter({
      has: page.locator("[data-testid='recording-card']"),
    }).first();

    // 如果没有语音卡片，跳过
    if (!(await audioCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 录音卡片应包含播放按钮和「原文」链接
    await expect(audioCard.locator("[data-testid='recording-card']")).toBeVisible();
    await expect(audioCard.getByText("原文")).toBeVisible();
  });

  test("点击「原文」展开转录文本，再次点击收起", async ({ page }) => {
    await goToDiary(page);

    const audioCard = page.locator("[data-testid='timeline-card']").filter({
      has: page.locator("[data-testid='recording-card']"),
    }).first();

    if (!(await audioCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 点击「原文」展开
    await audioCard.getByText("原文").click();
    await expect(audioCard.locator("[data-testid='transcript-panel']")).toBeVisible();

    // 点击「收起」折叠
    await audioCard.getByText("收起").first().click();
    await expect(audioCard.locator("[data-testid='transcript-panel']")).not.toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════
// E2: 文字日记 — 无原文区域
// ══════════════════════════════════════════════════════════════════

test.describe("E2: 文字日记 — 无原文", () => {
  test("纯文字卡片不显示录音条和原文按钮", async ({ page }) => {
    await goToDiary(page);

    // 找到没有录音条的普通卡片
    const textCard = page.locator("[data-testid='timeline-card']").filter({
      hasNot: page.locator("[data-testid='recording-card']"),
    }).filter({
      hasNot: page.locator("[data-testid='attachment-card']"),
    }).first();

    if (!(await textCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 不应有「原文」按钮
    await expect(textCard.getByText("原文")).not.toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════
// E3: 图片缩略图与管理
// ══════════════════════════════════════════════════════════════════

test.describe("E3: 图片管理", () => {
  test("图片卡片显示缩略图，点击可查看原图", async ({ page }) => {
    await goToDiary(page);

    const imageThumb = page.locator("[data-testid='image-thumbnail']").first();

    if (!(await imageThumb.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 点击缩略图
    await imageThumb.click();

    // 应打开全屏查看器
    await expect(page.locator("[data-testid='image-viewer']")).toBeVisible();
  });

  test("长按缩略图弹出管理菜单", async ({ page }) => {
    await goToDiary(page);

    const imageThumb = page.locator("[data-testid='image-thumbnail']").first();

    if (!(await imageThumb.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 长按
    await imageThumb.dispatchEvent("pointerdown");
    await page.waitForTimeout(600);
    await imageThumb.dispatchEvent("pointerup");

    // 应显示管理菜单
    await expect(page.getByText("保存到相册")).toBeVisible();
    await expect(page.getByText("删除图片")).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════
// E4: 展开卡片的折叠方式 — 尾部收起按钮
// ══════════════════════════════════════════════════════════════════

test.describe("E4: 折叠方式", () => {
  test("展开后点击正文区域不会折叠，必须点底部收起按钮", async ({ page }) => {
    await goToDiary(page);

    const card = page.locator("[data-testid='timeline-card']").first();
    if (!(await card.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 点击卡片展开
    await card.click();
    await waitForIdle(page, 500);

    // 确认已展开（有收起按钮）
    const collapseBtn = card.locator("[data-testid='collapse-button']");
    await expect(collapseBtn).toBeVisible();

    // 点击正文区域 — 不应折叠
    await card.locator("[data-testid='card-content']").click();
    await page.waitForTimeout(300);
    await expect(collapseBtn).toBeVisible(); // 仍然展开

    // 点击收起按钮 — 应折叠
    await collapseBtn.click();
    await page.waitForTimeout(300);
    await expect(collapseBtn).not.toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════
// E5: 附件卡片嵌入
// ══════════════════════════════════════════════════════════════════

test.describe("E5: 附件卡片", () => {
  test("附件记录显示附件卡片，含文件名和原文按钮", async ({ page }) => {
    await goToDiary(page);

    const attachCard = page.locator("[data-testid='attachment-card']").first();

    if (!(await attachCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 附件卡片应有文件名和「原文」按钮
    await expect(attachCard.locator("[data-testid='file-name']")).toBeVisible();
    await expect(attachCard.getByText("原文")).toBeVisible();
  });

  test("点击附件「原文」展开预览", async ({ page }) => {
    await goToDiary(page);

    const attachCard = page.locator("[data-testid='attachment-card']").first();

    if (!(await attachCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await attachCard.getByText("原文").click();
    await expect(page.locator("[data-testid='transcript-panel']")).toBeVisible();
  });
});
