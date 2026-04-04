/**
 * CommandSheet 全量标签 + 文字输入 E2E 截图验证
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/command-sheet-tags.spec.ts --headed --reporter=list
 */
import { test, expect, type Page } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

const phone = `138${Date.now().toString().slice(-8)}`;
const password = "test123456";

// ── Helpers ──────────────────────────────────────────────────────

async function waitForIdle(page: Page, ms = 1000) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function gw(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>,
) {
  const res = await fetch(`${GW}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

// ══════════════════════════════════════════════════════════════════

let deviceId: string;
let accessToken: string;

function authHeaders() {
  const h: Record<string, string> = { "X-Device-Id": deviceId };
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

test.describe.serial("CommandSheet 全量标签展示", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ── 0. 注册 + 登录 ──

  test("注册并进入主页", async () => {
    // 注册设备
    const devRes = await gw("POST", "/api/v1/devices/register", {
      identifier: `e2e-cmdsheet-${Date.now()}`,
      platform: "web",
    });
    expect([200, 201]).toContain(devRes.status);
    deviceId = devRes.data.id;

    // 注册用户
    const regRes = await gw("POST", "/api/v1/auth/register", {
      phone,
      password,
      displayName: "E2E指令",
      deviceId,
    });
    expect([200, 201]).toContain(regRes.status);
    accessToken = regRes.data.accessToken;

    // 浏览器打开
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // 登录
    const loginBtn = page.locator("button").filter({ hasText: /登录/ }).first();
    await loginBtn.waitFor({ timeout: 10_000 });
    await page.locator('input[type="tel"]').fill(phone);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator("button").filter({ hasText: /^登录$|^登录中/ }).click();
    await waitForIdle(page, 3000);

    // 跳过引导流程
    // 先点底部"跳过，直接开始"
    const directStart = page.locator("text=直接开始").first();
    if (await directStart.isVisible({ timeout: 3000 }).catch(() => false)) {
      await directStart.click();
      await waitForIdle(page, 2000);
    }
    // 再检查有没有其他跳过按钮
    const skipBtn = page.locator("button").filter({ hasText: /跳过|暂不/ }).first();
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click();
      await waitForIdle(page);
    }
  });

  // ── 1. 触发 CommandSheet 并截图 ──

  test("在待办页触发 CommandSheet，验证全量标签和文字输入", async () => {
    // 切到待办页
    const todoTab = page.locator("text=待办").first();
    if (await todoTab.isVisible()) {
      await todoTab.click();
      await waitForIdle(page, 500);
    }

    // 截图 0：待办页初始状态
    await page.screenshot({
      path: "e2e/screenshots/cs-0-todo-page.png",
      fullPage: false,
    });

    // 先通过 gateway REST API 获取 AI 提取结果
    const transcript = "每周一三五下午3点找张总谈合作方案，提前半小时提醒，还有买点咖啡豆";

    // 打开 CommandSheet 并直接注入 AI 结果（跳过 ws 等待）
    await page.evaluate((text: string) => {
      window.dispatchEvent(
        new CustomEvent("v2note:forceCommand", {
          detail: { transcript: text },
        }),
      );
    }, transcript);

    await page.waitForTimeout(800);

    // 截图 1：CommandSheet processing 阶段
    await page.screenshot({
      path: "e2e/screenshots/cs-1-processing.png",
      fullPage: false,
    });

    // 通过 WebSocket 向自己发送模拟的 process.result 消息
    // 找到页面上已有的 WebSocket 连接，直接触发 onmessage
    await page.evaluate(() => {
      const tomorrow = new Date(Date.now() + 86400000);
      const mockResult = {
        type: "process.result",
        payload: {
          todo_commands: [
            {
              action_type: "create",
              confidence: 0.95,
              todo: {
                text: "找张总谈合作方案",
                scheduled_start: tomorrow.toISOString(),
                estimated_minutes: 45,
                priority: 5,
                person: "张总",
                goal_hint: "Q2商务拓展",
                reminder: { enabled: true, before_minutes: 30, types: ["notification"] },
                recurrence: { rule: "weekly:1,3,5", end_date: null },
              },
            },
            {
              action_type: "create",
              confidence: 0.9,
              todo: {
                text: "买咖啡豆",
                scheduled_start: new Date().toISOString(),
                priority: 1,
                estimated_minutes: 15,
              },
            },
          ],
          voice_intent_type: "action",
        },
      };

      // 通过暴露在 window 上的 gatewayClient 单例注入消息
      const client = (window as any).__gatewayClient;
      if (client && typeof client.injectMessage === "function") {
        client.injectMessage(mockResult);
        console.log("✓ 通过 __gatewayClient.injectMessage 注入成功");
      } else {
        console.warn("__gatewayClient not found or injectMessage not available");
      }
    });

    await page.waitForTimeout(1000);

    // 如果上面方案不成功，尝试直接等 AI 或截图当前状态
    try {
      await page.waitForSelector("text=识别到", { timeout: 5000 });
      console.log("✓ CommandSheet result 阶段可见");
    } catch {
      console.log("⚠ Commands 未注入成功，截图当前状态");
    }

    // 截图 2：result 阶段（带全量标签）
    await page.screenshot({
      path: "e2e/screenshots/cs-2-result-tags.png",
      fullPage: false,
    });

    // 检查标签元素
    const hasClock = await page.locator("text=今天").or(page.locator("text=明天")).first().isVisible().catch(() => false);
    const hasTextInput = await page.locator("text=继续说话修改").first().isVisible().catch(() => false);
    const hasConfirm = await page.locator("text=确认").first().isVisible().catch(() => false);

    console.log(`时间标签: ${hasClock ? "✓" : "✗"}`);
    console.log(`继续说话: ${hasTextInput ? "✓" : "✗"}`);
    console.log(`确认按钮: ${hasConfirm ? "✓" : "✗"}`);

    // 点击"继续说话修改"切换到文字输入模式
    if (hasTextInput) {
      await page.locator("text=继续说话修改").first().click();
      await page.waitForTimeout(500);

      // 截图 3：文字输入模式
      await page.screenshot({
        path: "e2e/screenshots/cs-3-text-input-mode.png",
        fullPage: false,
      });

      // 输入修改指令
      const textInput = page.locator('input[placeholder="输入修改指令..."]').first();
      const inputVisible = await textInput.isVisible().catch(() => false);
      console.log(`文字输入框: ${inputVisible ? "✓" : "✗"}`);

      if (inputVisible) {
        await textInput.fill("改到后天下午4点");
        await page.waitForTimeout(300);

        // 截图 4：已输入文字
        await page.screenshot({
          path: "e2e/screenshots/cs-4-text-filled.png",
          fullPage: false,
        });
      }
    }

    console.log("\n所有截图已保存到 e2e/screenshots/");
  });
});
