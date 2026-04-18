/**
 * Fix: 本地优先捕获 — 录音/日记发送不依赖网络与鉴权
 *
 * 覆盖 spec: specs/fix-cold-resume-silent-loss.md
 *
 * 验收原则：用户捕获动作（录音/文字）在离线 / token过期 / gateway挂
 * 等任何网络异常下都**不静默丢失**。数据立刻本地落地、时间线即时可见，
 * 联网后自动同步，用户全程无阻塞错误提示。
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/fix-cold-resume-silent-loss.spec.ts --headed --reporter=list
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const GW = process.env.GW_URL ?? "http://localhost:3001";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
  permissions: ["microphone"],
  launchOptions: {
    // 允许 fake media stream 避免 getUserMedia 真实麦克风
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});

const phone = `139${Date.now().toString().slice(-8)}`;
const password = "test123456";

// ── Helpers ──

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
  return res.json().catch(() => null);
}

async function loginIfNeeded(page: Page) {
  const loginInput = page.locator('input[type="tel"], input[placeholder*="手机"]').first();
  if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginInput.fill(phone);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button:has-text("登录")').click();
    await waitForIdle(page, 2000);
  }
}

/**
 * 读取 IndexedDB captures store 所有条目
 */
async function readCaptures(page: Page) {
  return await page.evaluate(async () => {
    return await new Promise<any[]>((resolve, reject) => {
      const req = indexedDB.open("v2note-capture");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("captures")) {
          resolve([]);
          return;
        }
        const tx = db.transaction("captures", "readonly");
        const store = tx.objectStore("captures");
        const all = store.getAll();
        all.onsuccess = () => resolve(all.result as any[]);
        all.onerror = () => reject(all.error);
      };
    });
  });
}

/**
 * 模拟 token 过期（删掉 access_token，保留 refresh_token 或清光）
 */
async function simulateTokenExpired(page: Page, clearRefresh = false) {
  await page.evaluate((clearRefresh) => {
    // Supabase 的 session 存储键可能形如 sb-<project>-auth-token
    for (const key of Object.keys(localStorage)) {
      if (key.includes("auth-token") || key.includes("supabase")) {
        if (clearRefresh) {
          localStorage.removeItem(key);
        } else {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed?.access_token) {
              parsed.access_token = "expired." + parsed.access_token;
              parsed.expires_at = Math.floor(Date.now() / 1000) - 60;
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch { /* noop */ }
        }
      }
    }
  }, clearRefresh);
}

/**
 * 触发页面的录音流程：长按 FAB 并在 N 毫秒后松开
 */
async function fabRecord(page: Page, durationMs = 2000) {
  const fab = page.locator('[data-testid="fab-record"], [aria-label*="录音"], button:has-text("FAB")').first();
  await expect(fab).toBeVisible({ timeout: 5000 });
  const box = await fab.boundingBox();
  if (!box) throw new Error("FAB not found");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}

async function resetReconnectAttemptsExhausted(page: Page) {
  // 模拟长时间后台导致 reconnectAttempts 已耗尽 + ws 为关闭态
  await page.evaluate(() => {
    // gateway-client 单例可能挂在 window 或可通过模块访问
    // 这里通过伪造 navigator.onLine false → true 让守卫必须重置退避
    (window as any).__TEST_EXHAUST_RECONNECT = true;
  });
}

// ── Setup ──

test.beforeAll(async () => {
  await gw("POST", "/api/v1/auth/register", { phone, password });
});

// ───────────────────────────────────────────────────────────
// regression: fix-cold-resume-silent-loss
// ───────────────────────────────────────────────────────────
test.describe("regression: fix-cold-resume-silent-loss", () => {
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    page = await context.newPage();
    await page.goto(WEB);
    await waitForIdle(page);
    await loginIfNeeded(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ─── 行为 1：飞行模式下 FAB 录音完整可用 ───
  test("行为1: 飞行模式下 FAB 录音 → 时间线立刻出现且本地可回放", async () => {
    // Given: 在线且已登录
    await page.goto(WEB);
    await waitForIdle(page);

    // When: 切飞行模式 → 长按 FAB 录音
    await context.setOffline(true);
    await fabRecord(page, 2500);

    // Then: FAB 立即显示"已记录"成功提示
    const recordedToast = page.locator('text=已记录');
    await expect(recordedToast).toBeVisible({ timeout: 2000 });

    // And: 时间线立刻出现该条目（带 ⏳ 小标记）
    const timelineItem = page.locator('[data-testid="timeline-item"], [data-testid="note-card"]').first();
    await expect(timelineItem).toBeVisible({ timeout: 3000 });
    await expect(timelineItem.locator('[data-sync-status="captured"], [aria-label*="同步中"]')).toBeVisible();

    // And: captures 表中有一条本地记录，audioLocalId 非空
    const captures = await readCaptures(page);
    const voice = captures.find((c) => c.kind === "diary" && c.audioLocalId);
    expect(voice).toBeTruthy();
    expect(voice.syncStatus).toMatch(/captured|syncing/);

    // And: 禁止出现"网络未连接"类错误
    await expect(page.locator('text=/网络未连接|发送失败|录音已取消/')).toHaveCount(0);

    // When: 恢复网络
    await context.setOffline(false);

    // Then: 同步在若干秒内完成，⏳ 消失
    await expect(page.locator('[data-sync-status="synced"]').first()).toBeVisible({ timeout: 15000 });
  });

  // ─── 行为 2：飞行模式下文字发送完整可用 ───
  test("行为2: 飞行模式下 ChatView 发送文字 → 立刻入聊天且保留", async () => {
    await page.goto(`${WEB}/chat`);
    await waitForIdle(page);

    await context.setOffline(true);

    const input = page.locator('textarea, input[type="text"]').filter({ hasText: "" }).first();
    await input.fill("离线测试消息");
    const sendBtn = page.locator('button[aria-label*="发送"], button:has-text("发送")').first();
    await sendBtn.click();

    // Then: 输入框立即清空
    await expect(input).toHaveValue("", { timeout: 1000 });

    // And: 消息立刻出现在聊天列表（带同步中标记）
    const msg = page.locator('text="离线测试消息"').first();
    await expect(msg).toBeVisible({ timeout: 2000 });
    await expect(page.locator('[data-sync-status="captured"], [aria-label*="同步中"]').first()).toBeVisible();

    // And: 切换页面再回来，消息仍在
    await page.goto(`${WEB}/timeline`);
    await waitForIdle(page);
    await page.goto(`${WEB}/chat`);
    await waitForIdle(page);
    await expect(page.locator('text="离线测试消息"')).toBeVisible();

    // And: captures 表内存在该条 chat_user_msg
    const captures = await readCaptures(page);
    const chatMsg = captures.find((c) => c.kind === "chat_user_msg" && c.text === "离线测试消息");
    expect(chatMsg).toBeTruthy();

    // And: 禁止出现"发送失败"阻塞提示
    await expect(page.locator('text=/发送失败|未连接到服务器/')).toHaveCount(0);

    // 恢复网络 → 自动同步
    await context.setOffline(false);
    await expect(page.locator('[data-sync-status="synced"]').first()).toBeVisible({ timeout: 15000 });
  });

  // ─── 行为 3：token 过期 + ws 挂 + 冷唤醒首次操作不阻塞 ───
  test("行为3: token过期+ws挂+reconnect耗尽 → 冷唤醒首次录音不阻塞", async () => {
    await page.goto(WEB);
    await waitForIdle(page);

    // 模拟：token 过期 + reconnectAttempts 耗尽
    await simulateTokenExpired(page, false);
    await resetReconnectAttemptsExhausted(page);

    // 模拟 App 后台→前台
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // When: 用户立即长按 FAB 录音
    const before = Date.now();
    await fabRecord(page, 1500);
    const elapsed = Date.now() - before;

    // Then: 不出现阻塞提示 "连接中…"超过 300ms 或 "无法连接"
    await expect(page.locator('text=/无法连接|网络未恢复|发送失败/')).toHaveCount(0);

    // And: 录音落地 captures（100ms 内本应完成，给足 2s buffer）
    const captures = await readCaptures(page);
    expect(captures.length).toBeGreaterThan(0);
    const latest = captures.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
    expect(latest.syncStatus).toMatch(/captured|syncing|synced/);

    // And: 总耗时没有被 waitForReady 8s 阻塞
    expect(elapsed).toBeLessThan(4000);
  });

  // ─── 行为 4：本地条目在刷新页面后仍存在 ───
  test("行为4: 飞行模式捕获多条 → 刷新 → 条目全部恢复 → 联网同步", async () => {
    await page.goto(`${WEB}/chat`);
    await waitForIdle(page);
    await context.setOffline(true);

    // 连发 3 条文字
    const input = page.locator('textarea, input[type="text"]').first();
    for (let i = 1; i <= 3; i++) {
      await input.fill(`离线条目-${i}`);
      await page.locator('button[aria-label*="发送"], button:has-text("发送")').first().click();
      await page.waitForTimeout(200);
    }

    // 录 2 条语音
    await page.goto(WEB);
    await waitForIdle(page);
    await fabRecord(page, 1200);
    await page.waitForTimeout(500);
    await fabRecord(page, 1200);
    await page.waitForTimeout(500);

    const beforeReload = await readCaptures(page);
    const unsyncedBefore = beforeReload.filter((c) =>
      ["captured", "syncing", "failed"].includes(c.syncStatus),
    );
    expect(unsyncedBefore.length).toBeGreaterThanOrEqual(5);

    // 刷新
    await page.reload();
    await waitForIdle(page);

    // 仍在飞行模式：本地条目仍在
    const afterReload = await readCaptures(page);
    const unsyncedAfter = afterReload.filter((c) =>
      ["captured", "syncing", "failed"].includes(c.syncStatus),
    );
    expect(unsyncedAfter.length).toBe(unsyncedBefore.length);

    // 恢复网络 → 全部自动同步
    await context.setOffline(false);
    await expect
      .poll(async () => {
        const now = await readCaptures(page);
        return now.filter((c) => c.syncStatus === "synced").length;
      }, { timeout: 30000, intervals: [1000, 2000, 3000] })
      .toBeGreaterThanOrEqual(unsyncedBefore.length);
  });

  // ─── 场景 3.5：斜杠命令在离线时被拒绝 ───
  test("场景3.5: 离线发送 /compact → 拒绝且输入框保留", async () => {
    await page.goto(`${WEB}/chat`);
    await waitForIdle(page);
    await context.setOffline(true);

    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill("/compact");
    await page.locator('button[aria-label*="发送"], button:has-text("发送")').first().click();

    // Then: 输入框保留
    await expect(input).toHaveValue("/compact", { timeout: 1000 });
    // And: 明确提示"命令需要联网"
    await expect(page.locator('text=/命令需要联网/')).toBeVisible({ timeout: 2000 });
    // And: captures 中不应生成该命令的 chat_user_msg
    const captures = await readCaptures(page);
    expect(captures.find((c) => c.text === "/compact")).toBeUndefined();

    await context.setOffline(false);
    // 清理：清空输入框，避免影响后续用例
    await input.fill("");
  });

  // ─── 场景 1.3：IndexedDB 跨 store 事务 + 孤儿清理 ───
  test("场景1.3: 启动 GC → 孤儿 audio_blobs 被清理，孤儿 captures 被标记 failed", async () => {
    // 注入一条孤儿 captures（audioLocalId 指向不存在的 blob）
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("v2note-capture");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("captures")) {
            resolve();
            return;
          }
          const tx = db.transaction("captures", "readwrite");
          const store = tx.objectStore("captures");
          store.put({
            localId: "orphan-test-1",
            serverId: null,
            kind: "diary",
            text: null,
            audioLocalId: "nonexistent-blob-xxx",
            sourceContext: "fab",
            forceCommand: false,
            notebook: null,
            createdAt: new Date().toISOString(),
            userId: null,
            syncStatus: "captured",
            lastError: null,
            retryCount: 0,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    // 刷新触发 startup GC
    await page.reload();
    await waitForIdle(page, 2000);

    // Then: 孤儿 captures 被标记 failed 而非静默丢弃
    const captures = await readCaptures(page);
    const orphan = captures.find((c) => c.localId === "orphan-test-1");
    expect(orphan).toBeTruthy();
    expect(orphan.syncStatus).toBe("failed");
    expect(orphan.lastError).toBe("audio_lost");
  });

  // ─── 场景 4.3：未登录捕获 + 登录归属 ───
  test("场景4.3: 未登录录音 → 本地落地 → 登录后回填 userId 并同步", async () => {
    const guestContext = await context.browser()!.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(WEB);
    await waitForIdle(guestPage);

    // 跳过登录
    const skipBtn = guestPage.locator('button:has-text("跳过"), button:has-text("本地使用")').first();
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
      await waitForIdle(guestPage);
    }

    // 未登录状态下录音
    await fabRecord(guestPage, 1500);
    await guestPage.waitForTimeout(800);

    const guestCaps = await readCaptures(guestPage);
    const guestCap = guestCaps[guestCaps.length - 1];
    expect(guestCap.userId).toBeNull();
    expect(guestCap.guestBatchId).toBeTruthy();
    expect(guestCap.syncStatus).toMatch(/captured|failed/);

    // 登录
    const guestPhone = `138${Date.now().toString().slice(-8)}`;
    await gw("POST", "/api/v1/auth/register", { phone: guestPhone, password });
    await loginIfNeeded(guestPage);
    await waitForIdle(guestPage, 2000);

    // Then: captures 的 userId 被回填且同步完成
    await expect
      .poll(async () => {
        const caps = await readCaptures(guestPage);
        const match = caps.find((c) => c.localId === guestCap.localId);
        return match?.syncStatus;
      }, { timeout: 20000 })
      .toBe("synced");

    await guestContext.close();
  });

  // ─── 场景 5.2：状态条区分离线 vs 服务不可用 ───
  test("场景5.2: 离线 → 灰条；在线但 gateway 不响应 → 黄条", async () => {
    // 离线 → 灰条
    await context.setOffline(true);
    await page.goto(WEB);
    await waitForIdle(page, 1000);
    await expect(page.locator('[data-testid="offline-banner"], text=/离线.*已保存/')).toBeVisible({
      timeout: 5000,
    });

    // 在线但拦截 gateway 请求 → 黄条（前 15 秒不显示）
    await context.setOffline(false);
    await page.route(`${GW}/**`, (route) => route.abort("failed"));
    await page.reload();
    await waitForIdle(page);

    // 前 15 秒不应出现状态条
    await expect(page.locator('[data-testid="sync-unavailable-banner"]')).toHaveCount(0);
    // 等到 30 秒后出现黄色条
    await page.waitForTimeout(31000);
    await expect(
      page.locator('[data-testid="sync-unavailable-banner"], text=/同步暂不可用/'),
    ).toBeVisible();

    await page.unroute(`${GW}/**`);
  });

  // ─── 场景 4.6：长时间离线后大批同步的进度反馈 ───
  test("场景4.6: 5+ 条待同步 → 显示'同步中 x/N'进度", async () => {
    await page.goto(`${WEB}/chat`);
    await waitForIdle(page);
    await context.setOffline(true);

    const input = page.locator('textarea, input[type="text"]').first();
    for (let i = 1; i <= 6; i++) {
      await input.fill(`batch-${i}`);
      await page.locator('button[aria-label*="发送"], button:has-text("发送")').first().click();
      await page.waitForTimeout(150);
    }

    await context.setOffline(false);

    // 进度条应出现
    await expect(
      page.locator('[data-testid="sync-progress"], text=/同步中 \d+\/\d+/'),
    ).toBeVisible({ timeout: 5000 });

    // 同步完成后消失
    await expect(page.locator('[data-testid="sync-progress"]')).toBeHidden({ timeout: 45000 });
  });
});
