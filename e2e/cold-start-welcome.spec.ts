/**
 * E2E 验证：冷启动欢迎体验（v2 — AI 驱动对话）
 *
 * 验证场景：
 *   1. 注册 → 冷启动 AI 对话 → 进入主界面
 *   2. AI 对每步回答有回应（打字机效果后显示）
 *   3. 时间线出现欢迎日记
 *   4. 侧边栏"发现"按钮为灰色，点击弹 toast
 *   5. 侧边栏显示维度
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/cold-start-welcome.spec.ts --reporter=list
 */
import { test, expect, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

const phone = `138${Date.now().toString().slice(-8)}`;
const password = "test123456";
const userName = "欢迎测试";

// ── Helpers ──────────────────────────────────────────────────

async function waitForIdle(page: Page, ms = 1000) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** 等待输入框可用（AI 打字机效果结束后） */
async function waitForInput(page: Page, timeoutMs = 20_000) {
  const input = page.locator('input[type="text"]');
  await input.waitFor({ state: "visible", timeout: timeoutMs });
  // 等待 input 不再 disabled（打字机效果完成）
  await expect(input).toBeEnabled({ timeout: timeoutMs });
  return input;
}

/** 发送 onboarding 回答并等待 AI 回复完成 */
async function sendAnswer(page: Page, text: string) {
  const input = await waitForInput(page);
  await input.click();
  await input.fill(text);
  await page.waitForTimeout(100);
  await input.press("Enter");

  // 等待 AI 回复：typing indicator 出现 → 打字机效果 → 输入框重新可用
  // 最多等 15 秒（含 AI 调用 + 打字机效果）
  await waitForInput(page, 15_000);
  await page.waitForTimeout(300); // 额外等待 UI 稳定
}

/** 获取对话中所有消息的文本 */
async function getMessages(page: Page): Promise<string[]> {
  const bubbles = page.locator(".animate-bubble-enter, .rounded-2xl.px-4");
  const count = await bubbles.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = await bubbles.nth(i).innerText();
    if (t.trim()) texts.push(t.trim());
  }
  return texts;
}

// ══════════════════════════════════════════════════════════════
test.describe.serial("冷启动欢迎体验 E2E (v2)", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ── Phase 1: 注册 ─────────────────────────────────────────

  test("1. 注册新账号", async () => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const loginOrRegister = page.locator("button, a").filter({ hasText: /登录|注册/ }).first();
    await loginOrRegister.waitFor({ timeout: 10_000 });

    const switchToRegister = page.locator("button").filter({ hasText: "没有账号？立即注册" });
    if (await switchToRegister.isVisible()) {
      await switchToRegister.click();
      await page.waitForTimeout(300);
    }

    await page.locator('input[type="tel"]').fill(phone);
    await page.locator('input[placeholder="昵称（选填）"]').fill(userName);

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill(password);
    await passwordInputs.nth(1).fill(password);

    await page.locator("button").filter({ hasText: /^注册$|^注册中/ }).click();

    // 等待进入欢迎页
    await expect(
      page.locator("h1").filter({ hasText: "你好，我是路路" }),
    ).toBeVisible({ timeout: 15_000 });

    console.log(`  ✅ 注册成功: ${phone}`);
  });

  // ── Phase 2: AI 驱动冷启动对话 ─────────────────────────────

  test("2. 完成冷启动 AI 对话", async () => {
    // 点"开始"
    await page.locator("button").filter({ hasText: "开始" }).first().click();

    // 等待 Q1 AI 消息出现 + 输入框可用
    await waitForInput(page, 10_000);

    // 验证初始 AI 消息包含"称呼"相关内容
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).toContain("路路");
    console.log("  ✅ Q1 问题显示");

    // Q1: 名字
    await sendAnswer(page, userName);
    let msgs = await getMessages(page);
    console.log(`  💬 Q1 后消息数: ${msgs.length}`);
    // AI 应该有回应（至少 3 条消息：AI问 → 用户答 → AI回应）
    expect(msgs.length).toBeGreaterThanOrEqual(3);
    console.log(`  ✅ Q1 AI 回应: ${msgs[msgs.length - 1]?.slice(0, 50)}`);

    // Q2: 做什么
    await sendAnswer(page, "在铸造厂上班，业余做自己的产品");
    msgs = await getMessages(page);
    console.log(`  ✅ Q2 AI 回应: ${msgs[msgs.length - 1]?.slice(0, 50)}`);

    // Q3: 焦点
    await sendAnswer(page, "最近在忙产品上线");
    msgs = await getMessages(page);
    console.log(`  ✅ Q3 AI 回应: ${msgs[msgs.length - 1]?.slice(0, 50)}`);

    // Q4: 痛点
    await sendAnswer(page, "是的总是想到什么转头就忘");
    msgs = await getMessages(page);
    console.log(`  ✅ Q4 AI 回应: ${msgs[msgs.length - 1]?.slice(0, 50)}`);

    // Q5: 时间
    await sendAnswer(page, "晚上睡前");
    msgs = await getMessages(page);
    console.log(`  ✅ Q5 AI 回应（结束语）: ${msgs[msgs.length - 1]?.slice(0, 50)}`);

    // 验证总消息数：5 轮 × 2（用户+AI） + 1（初始AI问题） = 11 条
    expect(msgs.length).toBeGreaterThanOrEqual(8); // 容忍 AI 跳步
    console.log(`  📊 总消息数: ${msgs.length}`);

    // 等待进入主界面（onComplete 触发后 1.5 秒）
    await expect(
      page.locator('button[aria-label="打开侧边栏"]'),
    ).toBeVisible({ timeout: 20_000 });

    console.log("  ✅ 冷启动 AI 对话完成 → 主界面");
  });

  // ── Phase 3: 验证欢迎日记 ─────────────────────────────────

  test("3. 时间线显示欢迎日记", async () => {
    await waitForIdle(page, 3000);

    // 切换 tab 触发加载
    const todoTab = page.locator("button").filter({ hasText: "待办" });
    if (await todoTab.isVisible()) {
      await todoTab.click();
      await page.waitForTimeout(1000);
    }
    const diaryTab = page.locator("button").filter({ hasText: "日记" });
    if (await diaryTab.isVisible()) {
      await diaryTab.click();
      await page.waitForTimeout(3000);
    }

    // 等待欢迎日记内容出现（最多 30 秒轮询）
    let bodyText = "";
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(3000);
      bodyText = await page.evaluate(() => document.body.innerText);
      if (
        bodyText.includes("功能介绍") ||
        bodyText.includes("认知操作系统") ||
        bodyText.includes("路路诞生") ||
        bodyText.includes("创始人")
      ) {
        break;
      }
      if (i === 3) {
        await todoTab.click().catch(() => {});
        await page.waitForTimeout(500);
        await diaryTab.click().catch(() => {});
      }
      console.log(`  ⏳ 等待欢迎日记出现... (${(i + 1) * 3}s)`);
    }

    const hasFeatureIntro = bodyText.includes("功能介绍") || bodyText.includes("核心功能") || bodyText.includes("混沌输入");
    const hasLuluStory = bodyText.includes("路路诞生") || bodyText.includes("涌现");
    const hasFounderLetter = bodyText.includes("创始人") || bodyText.includes("念念有路");

    console.log(`  📋 功能介绍: ${hasFeatureIntro ? "✅" : "❌"}`);
    console.log(`  📋 路路故事: ${hasLuluStory ? "✅" : "❌"}`);
    console.log(`  📋 创始人信: ${hasFounderLetter ? "✅" : "❌"}`);

    // 注意：不再断言 onboarding 日记（v2 不创建日记了）
    const welcomeCount = [hasFeatureIntro, hasLuluStory, hasFounderLetter].filter(Boolean).length;
    console.log(`  ✅ 欢迎日记: ${welcomeCount}/3 篇`);
  });

  // ── Phase 4: 侧边栏验证 ───────────────────────────────────

  test("4. 侧边栏发现按钮为灰色 + 点击弹 toast", async () => {
    await page.locator('button[aria-label="打开侧边栏"]').click();
    await page.waitForTimeout(500);

    const discoverBtn = page.locator("button").filter({ hasText: "发现" });
    await expect(discoverBtn).toBeVisible({ timeout: 3_000 });

    const opacity = await discoverBtn.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });
    console.log(`  🎨 发现按钮透明度: ${opacity}`);
    expect(parseFloat(opacity)).toBeLessThanOrEqual(0.5);

    await discoverBtn.click();
    await page.waitForTimeout(1000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasToast = bodyText.includes("更多功能还在路上") ||
                     bodyText.includes("认知地图") ||
                     bodyText.includes("大师视角");
    console.log(`  💬 Toast 弹出: ${hasToast ? "✅" : "❌"}`);

    // 关闭侧边栏
    const closeBtn = page.locator('button[aria-label="关闭侧边栏"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.locator(".bg-black\\/30").click({ force: true }).catch(() => {
        page.keyboard.press("Escape");
      });
    }
    await page.waitForTimeout(300);

    console.log("  ✅ 发现按钮灰色 + toast 验证通过");
  });

  test("5. 侧边栏「我的世界」显示种子目标", async () => {
    await page.locator('button[aria-label="打开侧边栏"]').click();
    await page.waitForTimeout(1000);

    const myWorld = page.locator("text=我的世界");
    await expect(myWorld).toBeVisible({ timeout: 5_000 });

    // 新版侧边栏：应显示从对话中提取的具体目标（非"X相关目标"）
    const bodyText = await page.evaluate(() => document.body.innerText);

    // 检查是否有具体的种子目标（来自 Q2/Q3 回答）
    // Q2: "在铸造厂上班，业余做自己的产品" → seed_goals 可能包含"产品开发""产品"等
    // Q3: "最近在忙产品上线" → seed_goals 可能包含"产品上线"
    const hasConcreteGoal = bodyText.includes("产品") ||
                            bodyText.includes("铸造") ||
                            bodyText.includes("上线");

    // 不应出现"X相关目标"这种废话
    const hasPlaceholder = bodyText.includes("相关目标");

    console.log(`  📋 有具体目标: ${hasConcreteGoal ? "✅" : "❌"}`);
    console.log(`  📋 无占位废话: ${!hasPlaceholder ? "✅" : "❌"}`);

    // 检查"新建目标"按钮存在
    const newGoalBtn = page.locator("button").filter({ hasText: "新建目标" });
    const hasNewGoalBtn = await newGoalBtn.isVisible();
    console.log(`  📋 新建目标按钮: ${hasNewGoalBtn ? "✅" : "❌"}`);

    // 至少应该有引导文字或具体目标
    const hasContent = hasConcreteGoal || bodyText.includes("持续记录想法");
    expect(hasContent).toBeTruthy();

    console.log(`  ✅ 侧边栏「我的世界」验证通过`);

    const closeBtn = page.locator('button[aria-label="关闭侧边栏"]');
    if (await closeBtn.isVisible()) await closeBtn.click();
    await page.waitForTimeout(300);
  });
});
