/**
 * Fix: 待办项目视图添加后消失 — E2E 验收测试
 *
 * 覆盖 spec: specs/fix-todo-project-vanish.md
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/fix-todo-project-vanish.spec.ts --headed --reporter=list
 */
import { test, expect, type Page } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

const phone = `139${Date.now().toString().slice(-8)}`;
const password = "test123456";

// ── Helpers ──

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
  return res.json().catch(() => null);
}

let deviceId: string;

// ── Setup: 注册用户 + 创建项目 ──

test.beforeAll(async () => {
  // 注册
  await gw("POST", "/api/v1/auth/register", { phone, password });
});

test.describe("regression: fix-todo-project-vanish", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // 登录
    await page.goto("http://localhost:3000");
    await waitForIdle(page);

    // 如果有登录页面，执行登录
    const loginInput = page.locator('input[type="tel"], input[placeholder*="手机"]').first();
    if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginInput.fill(phone);
      await page.locator('input[type="password"]').first().fill(password);
      await page.locator('button:has-text("登录")').click();
      await waitForIdle(page, 2000);
    }

    // 获取 deviceId（从 localStorage 或 cookie）
    deviceId = await page.evaluate(() => localStorage.getItem("v2note:deviceId") ?? "");

    // 通过 API 创建一个项目（level=1）
    const headers: Record<string, string> = {};
    const token = await page.evaluate(() => localStorage.getItem("v2note:token") ?? "");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (deviceId) headers["x-device-id"] = deviceId;

    const result = await gw("POST", "/api/v1/todos", {
      text: "E2E 测试项目",
      level: 1,
      status: "active",
    }, headers);
    projectId = result?.id;
    expect(projectId).toBeTruthy();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("行为1: 项目视图添加待办后应出现在项目卡片中", async () => {
    // 切到待办 tab
    await page.locator('[data-tab="todo"], button:has-text("待办")').first().click();
    await waitForIdle(page);

    // 切到项目视图
    const projectViewToggle = page.locator('button:has-text("项目"), [data-view="project"]').first();
    if (await projectViewToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await projectViewToggle.click();
      await waitForIdle(page);
    }

    // 找到项目卡片上的添加按钮
    const projectCard = page.locator('[data-testid="project-view"]');
    await expect(projectCard).toBeVisible({ timeout: 5000 });

    // 点击添加按钮
    const addButton = projectCard.locator('button:has-text("+"), [data-testid="add-todo"]').first();
    await addButton.click();
    await waitForIdle(page);

    // 填写待办内容
    const input = page.locator('[data-testid="todo-input"], input[placeholder*="做什么"]').first();
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.fill("项目视图测试任务");

    // 提交
    const submitBtn = page.locator('[data-testid="todo-submit"], button:has-text("添加")').first();
    await submitBtn.click();
    await waitForIdle(page, 2000);

    // 验证：任务应出现在页面中
    const taskText = page.locator('text="项目视图测试任务"');
    await expect(taskText).toBeVisible({ timeout: 5000 });
  });

  test("行为1b: 刷新后任务仍存在", async () => {
    // 刷新页面
    await page.reload();
    await waitForIdle(page, 2000);

    // 切到待办 tab
    await page.locator('[data-tab="todo"], button:has-text("待办")').first().click();
    await waitForIdle(page);

    // 切到项目视图
    const projectViewToggle = page.locator('button:has-text("项目"), [data-view="project"]').first();
    if (await projectViewToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await projectViewToggle.click();
      await waitForIdle(page);
    }

    // 验证任务仍然存在
    const taskText = page.locator('text="项目视图测试任务"');
    await expect(taskText).toBeVisible({ timeout: 5000 });
  });
});
