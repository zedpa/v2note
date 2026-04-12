/**
 * UI/UX 审查 Round 1 — 移动端精修 E2E 验收测试
 *
 * 覆盖 spec: specs/ui-ux-audit.md Section 9 验收行为 1-8
 * 范围: P1 可访问性 + P3 性能 + P5 布局（移动端，不改导航架构）
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/ui-ux-audit-r1.spec.ts --headed --reporter=list
 */
import { test, expect, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
  colorScheme: "dark",
});

// ── Helpers ──────────────────────────────────────────────────────

async function waitForIdle(page: Page, ms = 1000) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** 登录并进入主页 */
async function loginAndGoHome(page: Page) {
  await page.goto("/");
  await waitForIdle(page);

  // 如果在登录页，执行登录
  const loginBtn = page.getByRole("button", { name: "登录" });
  if (await loginBtn.isVisible().catch(() => false)) {
    const phoneInput = page.getByPlaceholder("手机号");
    const pwdInput = page.getByPlaceholder("密码");
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("13874917509");
      await pwdInput.fill("test123456");
      await loginBtn.click();
      await waitForIdle(page, 3000);
    }
  }

  // 处理 Onboarding 流程（新用户冷启动）
  const skipOnboarding = page.getByRole("button", { name: /跳过/ });
  if (await skipOnboarding.isVisible().catch(() => false)) {
    await skipOnboarding.click();
    await waitForIdle(page, 2000);
  }

  // 等待简报浮层弹出（最多 5 秒），然后关闭
  // 简报可能延迟弹出，需要轮询等待
  for (let i = 0; i < 10; i++) {
    // 再次检查 onboarding（可能有多步）
    const skipBtn = page.getByRole("button", { name: /跳过|开始/ });
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click();
      await waitForIdle(page, 1000);
      continue;
    }

    const closeBtn = page.getByRole("button", { name: /关闭今日简报/ }).or(
      page.locator("[data-testid='morning-briefing'] button").filter({ hasText: "×" })
    );
    if (await closeBtn.first().isVisible().catch(() => false)) {
      await closeBtn.first().click();
      await waitForIdle(page, 500);
      break;
    }

    // 如果 header 已经可见，说明无需等简报
    const header = page.locator("header").first();
    if (await header.isVisible().catch(() => false)) break;

    await page.waitForTimeout(500);
  }

  // 确保 header 可见后再继续
  await page.locator("header").first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
}

/** 切换到日记视图 */
async function goToDiary(page: Page) {
  const diaryTab = page.getByRole("tab", { name: "日记" }).or(
    page.getByRole("button", { name: "日记" })
  );
  if (await diaryTab.isVisible().catch(() => false)) {
    await diaryTab.click();
    await waitForIdle(page, 500);
  }
}

/** 切换到待办视图 */
async function goToTodo(page: Page) {
  // 等待 tablist 出现
  await page.getByRole("tablist").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});

  const todoTab = page.getByRole("tab", { name: /待办/ });
  if (await todoTab.isVisible().catch(() => false)) {
    await todoTab.click();
    await waitForIdle(page, 1000);
  }
}

// ══════════════════════════════════════════════════════════════════
// 行为 1: 暗色模式对比度
// ══════════════════════════════════════════════════════════════════

test.describe("行为 1: 暗色模式对比度", () => {
  test("muted-foreground 在 dark mode 下对比度 >= 4.5:1", async ({ page }) => {
    await loginAndGoHome(page);
    await goToTodo(page);

    // 获取 CSS 变量的实际计算值
    const colors = await page.evaluate(() => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      return {
        mutedFg: style.getPropertyValue("--muted-foreground").trim(),
        card: style.getPropertyValue("--card").trim(),
        background: style.getPropertyValue("--background").trim(),
      };
    });

    // muted-foreground 的 lightness 应 >= 55%（确保对比度达标）
    // HSL 格式: "25 5% 58%" — 提取 lightness
    const lightness = parseFloat(colors.mutedFg.split(/\s+/)[2]);
    expect(lightness).toBeGreaterThanOrEqual(55);
  });

  test("card 与 background 在 dark mode 下有足够视觉分离", async ({ page }) => {
    await loginAndGoHome(page);

    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        cardL: parseFloat(style.getPropertyValue("--card").trim().split(/\s+/)[2]),
        bgL: parseFloat(style.getPropertyValue("--background").trim().split(/\s+/)[2]),
      };
    });

    // card lightness 应比 background 高至少 4 个百分点
    expect(colors.cardL - colors.bgL).toBeGreaterThanOrEqual(4);
  });
});

// ══════════════════════════════════════════════════════════════════
// 行为 2: 触控目标尺寸
// ══════════════════════════════════════════════════════════════════

test.describe("行为 2: 触控目标尺寸", () => {
  test("Header 所有按钮可交互区域 >= 44x44px", async ({ page }) => {
    await loginAndGoHome(page);

    // 检查 header 区域的按钮
    const header = page.locator("header").first();
    const buttons = header.getByRole("button");
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (!(await btn.isVisible())) continue;

      const box = await btn.boundingBox();
      if (!box) continue;

      expect(
        box.width >= 44 && box.height >= 44,
        `Header 按钮 #${i} 尺寸 ${box.width}x${box.height} 应 >= 44x44`
      ).toBe(true);
    }
  });

  test("Header 右侧按钮间距 >= 8px", async ({ page }) => {
    await loginAndGoHome(page);

    const header = page.locator("header").first();
    const buttons = header.getByRole("button");
    const boxes: { x: number; width: number }[] = [];

    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (!(await btn.isVisible())) continue;
      const box = await btn.boundingBox();
      if (box) boxes.push({ x: box.x, width: box.width });
    }

    // 按 x 坐标排序，检查相邻按钮间距
    boxes.sort((a, b) => a.x - b.x);
    for (let i = 1; i < boxes.length; i++) {
      const gap = boxes[i].x - (boxes[i - 1].x + boxes[i - 1].width);
      // 仅检查右侧区域（x > 200 的按钮）— 左侧头像和 tab 不需要紧邻间距
      if (boxes[i].x > 200) {
        expect(
          gap >= 8,
          `按钮 #${i - 1} 和 #${i} 间距 ${gap.toFixed(1)}px 应 >= 8px`
        ).toBe(true);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 行为 3: 日记卡片按压反馈（CSS 类验证）
// ══════════════════════════════════════════════════════════════════

test.describe("行为 3: 日记卡片按压反馈", () => {
  test("日记卡片包含 active 状态样式类", async ({ page }) => {
    await loginAndGoHome(page);
    await goToDiary(page);

    // 定位日记卡片的可点击元素
    const cards = page.locator("[data-testid='timeline-card']").or(
      page.locator("main button").filter({ hasText: /.{4,}/ })
    );
    const count = await cards.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstCard = cards.first();
    const classAttr = await firstCard.getAttribute("class") ?? "";

    // 验证包含 active 状态样式（scale 或 opacity）
    const hasActiveStyle =
      classAttr.includes("active:scale") ||
      classAttr.includes("active:opacity") ||
      classAttr.includes("pressable");

    expect(
      hasActiveStyle,
      `日记卡片应包含 active 按压样式，当前 class: ${classAttr.slice(0, 100)}...`
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// 行为 4: Tab ARIA 语义
// ══════════════════════════════════════════════════════════════════

test.describe("行为 4: Tab ARIA 语义", () => {
  test("日记/待办切换有 tablist + tab 角色", async ({ page }) => {
    await loginAndGoHome(page);

    // 检查 tablist 容器
    const tablist = page.getByRole("tablist");
    await expect(tablist).toBeVisible();

    // 检查 tab 角色
    const tabs = tablist.getByRole("tab");
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // 检查 aria-selected — 至少一个 tab 被选中
    let hasSelected = false;
    for (let i = 0; i < count; i++) {
      const selected = await tabs.nth(i).getAttribute("aria-selected");
      if (selected === "true") hasSelected = true;
    }
    expect(hasSelected).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// 行为 5: Emoji 替换为 SVG
// ══════════════════════════════════════════════════════════════════

test.describe("行为 5: 待办时段图标为 SVG", () => {
  test("时段标题使用 SVG 图标而非 emoji", async ({ page }) => {
    await loginAndGoHome(page);
    await goToTodo(page);

    // 等待时段标题渲染
    await page.locator("[data-testid='time-slot-header']").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});

    const slotHeaders = page.locator("[data-testid='time-slot-header']");
    const count = await slotHeaders.count();
    if (count === 0) {
      test.skip();
      return;
    }

    for (let i = 0; i < count; i++) {
      const header = slotHeaders.nth(i);
      if (!(await header.isVisible())) continue;

      // 应包含 svg 图标
      const svgCount = await header.locator("svg").count();
      expect(
        svgCount,
        `时段标题 #${i} 应包含 SVG 图标`
      ).toBeGreaterThanOrEqual(1);

      // 不应包含时段 emoji（🕐☀️⛅🌙）
      const text = await header.textContent() ?? "";
      const hasEmoji = /[\u{1F550}-\u{1F567}\u{2600}\u{26C5}\u{1F319}]/u.test(text);
      expect(
        hasEmoji,
        `时段标题 #${i} 不应使用 emoji 图标，内容: "${text}"`
      ).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 行为 6: 首屏性能（代码结构验证）
// ══════════════════════════════════════════════════════════════════

test.describe("行为 6: Overlay 组件懒加载", () => {
  test("app/page.tsx 中 overlay 组件使用 dynamic import", async ({}) => {
    // 读取 page.tsx 源码，验证 overlay 组件使用了 dynamic()
    const fs = await import("fs");
    const path = await import("path");
    const pagePath = path.resolve("app/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    // 应存在 dynamic import 调用
    expect(content).toContain("dynamic(");

    // 以下 overlay 组件不应有 eagerly import（不以 import XXX from 形式出现）
    const overlayNames = [
      "SearchView",
      "ChatView",
      "ReviewOverlay",
      "MorningBriefing",
      "EveningSummary",
      "GoalDetailOverlay",
      "NotificationCenter",
    ];

    for (const name of overlayNames) {
      // 检查不是常规 import（允许 dynamic(() => import(...))）
      const eagerPattern = new RegExp(
        `^import\\s+.*\\b${name}\\b.*from\\s+['"]`,
        "m"
      );
      expect(
        eagerPattern.test(content),
        `${name} 应使用 dynamic import，不应 eagerly import`
      ).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 行为 7: 简报骨架屏
// ══════════════════════════════════════════════════════════════════

test.describe("行为 7: 简报加载态", () => {
  test("简报组件源码包含骨架屏实现", async ({}) => {
    // 验证 MorningBriefing 组件包含 Skeleton 骨架屏而非纯文字 spinner
    // 运行时验证不稳定（依赖简报是否正在加载），改为代码结构验证
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve("features/daily/components/morning-briefing.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // 应导入 Skeleton 组件
    expect(content).toMatch(/import.*Skeleton/);

    // 应包含骨架屏渲染（animate-pulse 或 Skeleton 使用）
    expect(content).toMatch(/Skeleton|animate-pulse/);

    // 不应仅使用纯文字加载提示
    // "正在生成简报" 文字可以存在但应配合骨架屏
  });
});

// ══════════════════════════════════════════════════════════════════
// 行为 8: 日记卡片类型标记
// ══════════════════════════════════════════════════════════════════

test.describe("行为 8: 日记卡片类型边框标记", () => {
  test("语音记录卡片有绿色左边框", async ({ page }) => {
    await loginAndGoHome(page);
    await goToDiary(page);

    // 查找语音卡片（含音频播放器或 voice 标记）
    const voiceCard = page.locator("[data-testid='timeline-card']").filter({
      has: page.locator("[data-testid='recording-card'], [data-source-type='voice']"),
    }).first();

    if (!(await voiceCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 检查左边框样式
    const borderLeft = await voiceCard.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        width: style.borderLeftWidth,
        color: style.borderLeftColor,
      };
    });

    expect(
      parseFloat(borderLeft.width),
      "语音卡片应有 3px 左边框"
    ).toBeGreaterThanOrEqual(2);
  });

  test("普通文字卡片无彩色左边框", async ({ page }) => {
    await loginAndGoHome(page);
    await goToDiary(page);

    // 查找非语音、非素材的普通卡片
    const cards = page.locator("[data-testid='timeline-card']");
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      if (!(await card.isVisible())) continue;

      // 跳过有特殊标记的卡片
      const hasSpecial = await card.locator(
        "[data-testid='recording-card'], [data-source-type='voice'], [data-source-type='material'], [data-source-type='ai_diary']"
      ).count();
      if (hasSpecial > 0) continue;

      // 普通卡片不应有彩色左边框
      const borderWidth = await card.evaluate((el) =>
        parseFloat(getComputedStyle(el).borderLeftWidth)
      );
      expect(
        borderWidth,
        `普通卡片 #${i} 不应有粗左边框`
      ).toBeLessThanOrEqual(1);
      break; // 只检查第一个普通卡片
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 行为 9: 弹窗打开时 FAB 隐藏
// ══════════════════════════════════════════════════════════════════

test.describe("行为 9: 弹窗与 FAB 互斥", () => {
  test("打开聊天弹窗时 FAB 隐藏，关闭后恢复", async ({ page }) => {
    await loginAndGoHome(page);

    const fab = page.locator("[data-testid='fab-button']");
    if (!(await fab.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await expect(fab).toBeVisible();

    // 打开聊天弹窗
    const chatBtn = page.getByRole("button", { name: /AI 聊天/ }).first();
    if (!(await chatBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await chatBtn.click();
    await waitForIdle(page, 1000);

    // FAB 应隐藏
    await expect(fab).not.toBeVisible();

    // 关闭弹窗
    const closeOverlay = page.locator("[data-testid='overlay-close']").or(
      page.getByRole("button", { name: /关闭|返回/ })
    ).first();
    if (await closeOverlay.isVisible().catch(() => false)) {
      await closeOverlay.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await waitForIdle(page, 1000);

    // FAB 应恢复可见
    await expect(fab).toBeVisible();
  });

  test("打开搜索弹窗时 FAB 隐藏", async ({ page }) => {
    await loginAndGoHome(page);

    const fab = page.locator("[data-testid='fab-button']");
    if (!(await fab.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await expect(fab).toBeVisible();

    // 打开搜索
    const searchBtn = page.getByRole("button", { name: /搜索/ }).first();
    if (!(await searchBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await searchBtn.click();
    await waitForIdle(page, 1000);

    // FAB 应隐藏
    await expect(fab).not.toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════
// 补充: 简报关闭按钮 aria-label
// ══════════════════════════════════════════════════════════════════

test.describe("补充: 简报关闭按钮可访问性", () => {
  test("简报关闭按钮有 aria-label", async ({ page }) => {
    await loginAndGoHome(page);

    // 如果简报自动弹出
    const briefingTitle = page.getByText("今日简报");
    if (!(await briefingTitle.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // 简报面板内的关闭按钮应有 aria-label
    const closeBtn = page.getByRole("button", { name: /关闭/ });
    await expect(closeBtn).toBeVisible();

    const ariaLabel = await closeBtn.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain("关闭");
  });
});
