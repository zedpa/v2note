# V2Note E2E Playwright 模式手册

> 编写 E2E 测试时**必须**参照本文档，禁止凭空编写冷启动/鉴权/导航逻辑。

## 1. 基础配置

```typescript
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const GW = process.env.GW_URL ?? "http://localhost:3001";

test.use({
  viewport: { width: 390, height: 844 },  // 移动端视口，V2Note 标准
  channel: "chrome",
});
```

需要录音功能时额外添加：
```typescript
test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});
```

## 2. 测试用户生成

每个测试文件使用唯一用户，避免跨测试污染：
```typescript
const phone = `139${Date.now().toString().slice(-8)}`;
const password = "test123456";
```

## 3. Gateway HTTP Helper

所有后端交互通过此 helper（不要用 page.request）：
```typescript
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
```

## 4. 网络等待 Helper

```typescript
async function waitForIdle(page: Page, ms = 800) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}
```

## 5. 冷启动 + 鉴权处理（最重要）

V2Note 新用户进入后有多个引导阶段，**任何一步未处理都会卡住测试**：

### 方式 A：UI 登录 + 完整冷启动处理
```typescript
async function loginIfNeeded(page: Page) {
  // Step 1: 登录页检测
  const loginInput = page.locator('input[type="tel"], input[placeholder*="手机"]').first();
  if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginInput.fill(phone);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button:has-text("登录")').click();
    await waitForIdle(page, 2000);
  }
  // Step 2: 新用户 onboarding 引导页（"怎么称呼你？"），点「跳过」
  const skipOnboarding = page.locator('button:has-text("跳过")').first();
  if (await skipOnboarding.isVisible({ timeout: 1500 }).catch(() => false)) {
    await skipOnboarding.click();
    await waitForIdle(page, 1000);
  }
  // Step 3: 首次使用遮罩（"按住说话，松开自动记录 / 点击任意位置继续"）
  const firstRunHint = page.locator('text=点击任意位置继续').first();
  if (await firstRunHint.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.mouse.click(195, 400);
    await waitForIdle(page, 500);
  }
}
```

**Step 4：关闭"每日回顾"弹窗**（登录后可能自动弹出）
```typescript
  // Step 4: 每日回顾弹窗（"每日回顾" + fixed inset-0 z-50 覆盖全屏）
  const dailyReview = page.locator('button:has-text("晚安")').first();
  if (await dailyReview.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dailyReview.click();
    await waitForIdle(page, 500);
  }
  const closeX = page.locator('[class*="fixed inset-0"] button:has-text("×")').first();
  if (await closeX.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeX.click();
    await waitForIdle(page, 500);
  }
```

**注意事项：**
- 四个步骤缺一不可：登录 → onboarding 跳过 → first-run 遮罩关闭 → 每日回顾弹窗关闭
- 每步都用 `.catch(() => false)` 防止元素不存在时超时
- timeout 故意设短（1500-3000ms），元素不在就跳过，不阻塞

### 方式 B：Gateway 直接注册 + Token 注入（推荐）
```typescript
async function registerAndLogin(page: Page): Promise<string> {
  await gw("POST", "/api/v1/auth/register", { phone, password });
  const { data } = await gw("POST", "/api/v1/auth/login", { phone, password });
  const token = (data?.accessToken ?? data?.token) as string;
  const refreshToken = data?.refreshToken as string;
  const user = data?.user;
  expect(token).toBeTruthy();

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
  await waitForIdle(page);

  // 关闭 first-run 遮罩
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

  return token;
}
```

⚠️ **常见错误**：
- 用 `data.token` 而不是 `data.accessToken` → token 为 undefined
- 用 `auth_token` 而不是 `voicenote:accessToken` → 前端不识别
- 只设 accessToken 不设 user → `isLoggedIn` 检查失败
- 漏掉 `voicenote:sessionAlive` → session 被判断为过期

**选择哪种方式？**
- 测试关注点是**登录/注册/onboarding 本身** → 方式 A
- 测试关注点是**其他功能**，登录只是前置 → 方式 B（更快、更稳定）

## 6. 测试结构模式

```typescript
test.describe.serial("Feature Name", () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
  });

  test.afterAll(async () => { await page.close(); });

  test("Step 1: Setup", async () => { /* ... */ });
  test("Step 2: Action", async () => { /* ... */ });
  test("Step 3: Verify", async () => { /* ... */ });
});
```

## 7. 导航模式

```typescript
await page.goto(`${WEB}/timeline`);
await page.goto(`${WEB}/chat`);

// Tab 切换
const todoTab = page.locator("button").filter({ hasText: "待办" });
if (await todoTab.isVisible()) {
  await todoTab.click();
  await page.waitForTimeout(1000);
}
```

## 8. 离线/网络模拟

```typescript
await context.setOffline(true);
// ... 离线操作
await context.setOffline(false);
```

## 9. WebSocket 阻塞器

```typescript
async function installWsBlocker(page: Page) {
  await page.addInitScript(() => {
    (window as any).__e2eBlockWs = true;
    const RealWebSocket = window.WebSocket;
    class FakeBlockedWebSocket {
      readyState = 0;
      send() {} close() {} addEventListener() {} removeEventListener() {}
    }
    (window as any).WebSocket = ((url: string, ...args: any[]) => {
      if ((window as any).__e2eBlockWs) return new FakeBlockedWebSocket();
      return new RealWebSocket(url, ...args);
    }) as any;
  });
}
```

## 10. IndexedDB 读取

```typescript
async function readCaptures(page: Page) {
  return await page.evaluate(async () => {
    return await new Promise<any[]>((resolve, reject) => {
      const req = indexedDB.open("v2note-capture");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("captures")) { resolve([]); return; }
        const tx = db.transaction("captures", "readonly");
        const store = tx.objectStore("captures");
        const all = store.getAll();
        all.onsuccess = () => resolve(all.result as any[]);
        all.onerror = () => reject(all.error);
      };
    });
  });
}
```

## 11. Token 过期模拟

```typescript
async function simulateTokenExpired(page: Page, clearRefresh = false) {
  await page.evaluate((clearRefresh) => {
    for (const key of Object.keys(localStorage)) {
      if (key.includes("auth-token") || key.includes("supabase")) {
        if (clearRefresh) {
          localStorage.removeItem(key);
        } else {
          try {
            const parsed = JSON.parse(localStorage.getItem(key)!);
            if (parsed?.access_token) {
              parsed.access_token = "expired." + parsed.access_token;
              parsed.expires_at = Math.floor(Date.now() / 1000) - 60;
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch {}
        }
      }
    }
  }, clearRefresh);
}
```

## 12. FAB 录音模拟

```typescript
async function fabRecord(page: Page, durationMs = 2000) {
  const fab = page.locator('[data-testid="fab-record"]').first();
  await fab.waitFor({ state: "visible", timeout: 5000 });
  const box = await fab.boundingBox();
  expect(box).toBeTruthy();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}
```

## 13. Device 注册模式（纯 API 测试）

```typescript
let deviceId: string;
let accessToken: string;

test("Register device", async () => {
  const { data } = await gw("POST", "/api/v1/devices/register", {
    identifier: `e2e-${Date.now()}`,
    platform: "web",
  });
  deviceId = data.id;
});

function authHeaders() {
  const h: Record<string, string> = { "X-Device-Id": deviceId };
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}
```

## 14. 测试文件 JSDoc 模板

```typescript
/**
 * E2E 验收测试：[功能名称]
 *
 * 覆盖 spec: specs/[spec-file].md
 *
 * 验收场景：
 *   1. [场景1简述]
 *   2. [场景2简述]
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/[filename].spec.ts --reporter=list
 */
```
