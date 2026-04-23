/**
 * §7.7 诊断测试 —— 不做断言，只打印状态。
 * 运行：npx playwright test e2e/__diagnose-7-7.spec.ts --reporter=list --headed
 * 完成调试后删除此文件。
 */
import { test, type Page } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const GW = process.env.GW_URL ?? "http://localhost:3001";
const phone = `139${Date.now().toString().slice(-8)}`;
const password = "test123456";

async function gw(method: string, path: string, body?: any) {
  const res = await fetch(`${GW}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => null);
}

async function waitForIdle(page: Page, ms = 800) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function loginIfNeeded(page: Page) {
  const loginInput = page.locator('input[type="tel"], input[placeholder*="手机"]').first();
  if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginInput.fill(phone);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button:has-text("登录")').click();
    await waitForIdle(page, 2000);
  }
  const skipOnboarding = page.locator('button:has-text("跳过")').first();
  if (await skipOnboarding.isVisible({ timeout: 1500 }).catch(() => false)) {
    await skipOnboarding.click();
    await waitForIdle(page, 1000);
  }
  const firstRunHint = page.locator('text=点击任意位置继续').first();
  if (await firstRunHint.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.mouse.click(195, 400);
    await waitForIdle(page, 500);
  }
}

async function snapshot(page: Page, label: string) {
  const data = await page.evaluate(() => {
    const ls: Record<string, string | null> = {};
    for (const k of ["voicenote:accessToken", "voicenote:user", "v2note-guest-batch-id"]) {
      ls[k] = localStorage.getItem(k);
    }
    const caps = new Promise<any[]>((resolve) => {
      const req = indexedDB.open("v2note-capture");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("captures")) return resolve([]);
        const tx = db.transaction("captures", "readonly");
        const all = tx.objectStore("captures").getAll();
        all.onsuccess = () => resolve(all.result as any[]);
        all.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
    return Promise.resolve(caps).then((capList) => ({
      localStorage: ls,
      captures: capList.map((c: any) => ({
        localId: c.localId,
        userId: c.userId,
        guestBatchId: c.guestBatchId,
        syncStatus: c.syncStatus,
        text: c.text,
      })),
      authReady: (window as any).__authReady,
      currentUserId: (window as any).__getCurrentUser?.()?.id ?? null,
      currentBatch: (window as any).__peekGuestBatchId?.() ?? null,
      captureStoreMounted: typeof (window as any).__captureStore?.put === "function",
    }));
  });
  console.log(`[${label}]`, JSON.stringify(data, null, 2));
}

test.use({ viewport: { width: 390, height: 844 }, channel: "chrome", video: "off", trace: "off" });

test.beforeAll(async () => {
  await gw("POST", "/api/v1/auth/register", { phone, password });
});

test("diagnose §7.7", async ({ page }) => {
  await page.goto(WEB);
  await waitForIdle(page);
  await loginIfNeeded(page);
  await waitForIdle(page, 2000);

  await snapshot(page, "AFTER_LOGIN");

  // 注入
  const injected = await page.evaluate(async () => {
    const store = (window as any).__captureStore;
    if (!store || typeof store.put !== "function") {
      return { ok: false, reason: "put unavailable" };
    }
    const localId = `diag-${Date.now()}`;
    const res = await store.put({
      localId,
      kind: "diary",
      text: "诊断遗留日记",
      userId: null,
      syncStatus: "captured",
      createdAt: Date.now(),
    });
    return { ok: true, localId, res };
  });
  console.log("[INJECTION]", JSON.stringify(injected, null, 2));

  await snapshot(page, "AFTER_INJECT");

  await page.reload();
  await waitForIdle(page, 2000);
  // 不 loginIfNeeded 因为已登录
  await snapshot(page, "AFTER_RELOAD");

  // 等 5s 让 sync-orchestrator 跑一轮
  await page.waitForTimeout(5000);
  await snapshot(page, "AFTER_5S_WAIT");

  // 收集控制台日志
  page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
  await page.waitForTimeout(2000);
});
