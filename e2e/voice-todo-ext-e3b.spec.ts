/**
 * E2E 验收测试：voice-todo-ext E3b — 待办详情查看原文
 *
 * 覆盖 spec: specs/voice-todo-ext.md 场景 E3
 *
 * 验收场景：
 *   1. 语音创建的待办（有 record_id）→ 详情页显示"查看原文"
 *   2. 点击"查看原文"展开原始转写文本
 *   3. 手动创建的待办（无 record_id）→ 不显示"查看原文"
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/voice-todo-ext-e3b.spec.ts --reporter=list
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const GW = process.env.GW_URL ?? "http://localhost:3001";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

const phone = `139${Date.now().toString().slice(-8)}`;
const password = "test123456";

// ── Helpers ──────────────────────────────────────────────────────

async function waitForIdle(page: Page, ms = 800) {
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
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// ══════════════════════════════════════════════════════════════════

test.describe.serial("E3b 待办详情查看原文", () => {
  let page: Page;
  let context: BrowserContext;
  let token: string;
  let todoWithRecordId: string;
  let todoWithoutRecordId: string;
  let recordId: string;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
  });

  test.afterAll(async () => { await page.close(); });

  // ── 0. 注册 + 创建测试数据 ──

  test("注册并创建测试待办", { timeout: 60_000 }, async () => {
    // 注册 & 登录
    await gw("POST", "/api/v1/auth/register", { phone, password });
    const { data } = await gw("POST", "/api/v1/auth/login", { phone, password });
    token = (data?.accessToken ?? data?.token) as string;
    const refreshToken = data?.refreshToken as string;
    const user = data?.user;
    expect(token).toBeTruthy();
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 1. 通过 ingest 创建一条记录（模拟语音输入），获取 record_id
    const ingestRes = await gw("POST", "/api/v1/ingest", {
      content: "明天下午三点开产品评审会",
      type: "text",
    }, authHeaders);
    expect(ingestRes.status).toBeLessThanOrEqual(201);
    recordId = ingestRes.data?.record?.id ?? ingestRes.data?.id;
    expect(recordId).toBeTruthy();

    // 2. 创建一条关联 record_id 的待办
    const todoWithRec = await gw("POST", "/api/v1/todos", {
      text: "开产品评审会（有原文）",
      record_id: recordId,
    }, authHeaders);
    expect(todoWithRec.status).toBeLessThanOrEqual(201);
    todoWithRecordId = todoWithRec.data?.id;
    expect(todoWithRecordId).toBeTruthy();

    // 3. 创建一条无 record_id 的待办（手动创建）
    const todoNoRec = await gw("POST", "/api/v1/todos", {
      text: "手动创建的待办（无原文）",
    }, authHeaders);
    expect(todoNoRec.status).toBeLessThanOrEqual(201);
    todoWithoutRecordId = todoNoRec.data?.id;
    expect(todoWithoutRecordId).toBeTruthy();

    // Token 注入方式进入
    await page.goto(WEB);
    const userId = user?.id as string;
    await page.evaluate(([t, rt, u, uid]) => {
      localStorage.setItem("voicenote:accessToken", t);
      if (rt) localStorage.setItem("voicenote:refreshToken", rt);
      if (u) localStorage.setItem("voicenote:user", u);
      sessionStorage.setItem("voicenote:sessionAlive", "1");
      if (uid) {
        localStorage.setItem(`v2note:onboarded:${uid}`, "true");
        localStorage.setItem("v2note:onboarded", "true");
      }
    }, [token, refreshToken, user ? JSON.stringify(user) : "", userId ?? ""] as string[]);
    await page.goto(WEB);
    await waitForIdle(page, 2000);

    // 跳过 first-run 遮罩
    const hint = page.getByText(/点击任意位置继续|点击任意位置完成/);
    if (await hint.isVisible({ timeout: 1500 }).catch(() => false)) {
      await page.mouse.click(195, 400);
      await waitForIdle(page, 500);
    }

    // 关闭每日回顾弹窗
    const dailyReview = page.locator('button:has-text("晚安")').first();
    if (await dailyReview.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dailyReview.click();
      await waitForIdle(page, 500);
    }
  });

  // ── 1. 有 record_id 的待办 → 显示"查看原文" ──

  test("有关联原文的待办 → 详情页显示「查看原文」", async () => {
    // 切换到待办 Tab
    const todoTab = page.locator("button").filter({ hasText: "待办" });
    if (await todoTab.isVisible()) {
      await todoTab.click();
      await waitForIdle(page, 1000);
    }

    // 找到并点击"有原文"的待办
    const todoItem = page.getByText("开产品评审会（有原文）").first();
    await todoItem.waitFor({ state: "visible", timeout: 5000 });
    await todoItem.click();
    await waitForIdle(page, 500);

    // 验证「查看原文」按钮可见
    const viewSourceBtn = page.getByText("查看原文").first();
    await expect(viewSourceBtn).toBeVisible({ timeout: 3000 });
  });

  // ── 2. 点击「查看原文」展开原始文本 ──

  test("点击「查看原文」展开原始转写文本", async () => {
    const viewSourceBtn = page.getByText("查看原文").first();
    await viewSourceBtn.click();
    await waitForIdle(page, 500);

    // 原始内容应包含 ingest 时的文本
    const sourceText = page.getByText("明天下午三点开产品评审会").first();
    await expect(sourceText).toBeVisible({ timeout: 3000 });
  });

  // ── 3. 无 record_id 的待办 → 不显示"查看原文" ──

  test("手动创建的待办 → 不显示「查看原文」", async () => {
    // 关闭当前编辑页
    const closeBtn = page.locator('[data-testid="sheet-close"], button:has-text("×"), button:has-text("取消")').first();
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
      await waitForIdle(page, 500);
    } else {
      // 点击遮罩关闭
      await page.mouse.click(195, 50);
      await waitForIdle(page, 500);
    }

    // 点击"无原文"的待办
    const todoItem = page.getByText("手动创建的待办（无原文）").first();
    await todoItem.waitFor({ state: "visible", timeout: 5000 });
    await todoItem.click();
    await waitForIdle(page, 500);

    // 「查看原文」不应出现
    const viewSourceBtn = page.getByText("查看原文").first();
    const isVisible = await viewSourceBtn.isVisible({ timeout: 1500 }).catch(() => false);
    expect(isVisible).toBe(false);
  });
});
