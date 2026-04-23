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
  // 新用户 onboarding：若出现"怎么称呼你？"引导页，点"跳过，直接开始"
  const skipOnboarding = page.locator('button:has-text("跳过")').first();
  if (await skipOnboarding.isVisible({ timeout: 1500 }).catch(() => false)) {
    await skipOnboarding.click();
    await waitForIdle(page, 1000);
  }
  // 新用户 first-run 遮罩："按住说话，松开自动记录 / 点击任意位置继续"
  // 点页面中央关闭引导遮罩
  const firstRunHint = page.locator('text=点击任意位置继续').first();
  if (await firstRunHint.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.mouse.click(195, 400);
    await waitForIdle(page, 500);
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

// ───────────────────────────────────────────────────────────
// Phase 9 — 冷启动运行时修复（§7）
// regression: fix-cold-resume-silent-loss
// ───────────────────────────────────────────────────────────
test.describe("Phase9 regression: fix-cold-resume-silent-loss", () => {
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

  // ─── 场景 7.1 + 7.3：冷启动立即录音 → send() 不丢 + asr.stop 超时降级 ───
  test("场景7.1+7.3: token过期+ws未连时立即录音 → toast降级，数据不丢", async () => {
    await page.goto(WEB);
    await waitForIdle(page);

    // Given: token 过期 + WS 已 close + reconnect 耗尽
    await simulateTokenExpired(page, false);
    await resetReconnectAttemptsExhausted(page);
    await page.evaluate(() => {
      // 强制断开当前 WS（如果在）
      (window as any).__gatewayClient?.disconnect?.();
    });

    // When: 立即长按 FAB 录音 2 秒
    const before = Date.now();
    await fabRecord(page, 2000);

    // Then: captures 立即落地，syncStatus ∈ {captured, syncing}
    const captures = await readCaptures(page);
    const latest = captures
      .filter((c) => c.kind === "diary")
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
    expect(latest).toBeTruthy();
    expect(latest.syncStatus).toMatch(/captured|syncing|synced/);

    // And: 录音触发到 capture 落地 < 4s（不被 waitForReady 阻塞）
    expect(Date.now() - before).toBeLessThan(4500);

    // And: asr.stop 12s 无响应 → 降级 toast 出现
    await expect(
      page.locator('text=/录音已保存.*转写将在联网后自动完成/'),
    ).toBeVisible({ timeout: 15000 });

    // And: FAB 状态已复位（可再次点击不卡死）
    const fab = page.locator('[data-testid="fab-record"], [aria-label*="录音"]').first();
    await expect(fab).toBeEnabled();

    // And: 严禁出现"网络未连接/无法连接/发送失败"等旧阻塞提示
    await expect(page.locator('text=/网络未连接|无法连接.*服务器|发送失败/')).toHaveCount(0);
  });

  // ─── 场景 7.2：冷启动 userId=null → 登录后 worker 懒绑定 ───
  test("场景7.2: 冷启动录音/发送 userId=null → 登录后被 worker 回填并同步", async () => {
    const fresh = await context.browser()!.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    const p = await fresh.newPage();

    // Given: 全新设备（清空 auth）进入应用
    await p.goto(WEB);
    await waitForIdle(p);

    // 跳过登录进入本地模式
    const skipBtn = p.locator('button:has-text("跳过"), button:has-text("本地使用")').first();
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
      await waitForIdle(p);
    }

    // When: 冷启动立即发送文字
    await p.goto(`${WEB}/chat`);
    await waitForIdle(p);
    const input = p.locator('textarea, input[type="text"]').first();
    await input.fill("冷启动首次消息");
    await p.locator('button[aria-label*="发送"], button:has-text("发送")').first().click();
    await p.waitForTimeout(500);

    // Then: capture 落地 userId=null + guestBatchId 非空
    const preCaps = await readCaptures(p);
    const target = preCaps.find((c) => c.text === "冷启动首次消息");
    expect(target).toBeTruthy();
    expect(target!.userId).toBeNull();
    expect(target!.guestBatchId).toBeTruthy();

    const initialBatchId = target!.guestBatchId;

    // When: 用户在同一 session 内登录
    const coldPhone = `137${Date.now().toString().slice(-8)}`;
    await gw("POST", "/api/v1/auth/register", { phone: coldPhone, password });
    await loginIfNeeded(p);
    await waitForIdle(p, 2000);

    // Then: worker 扫描后该 capture 的 userId 被回填，guestBatchId 清空
    await expect
      .poll(async () => {
        const caps = await readCaptures(p);
        const m = caps.find((c) => c.localId === target!.localId);
        return { userId: m?.userId, guestBatchId: m?.guestBatchId, sync: m?.syncStatus };
      }, { timeout: 20000, intervals: [500, 1000, 2000] })
      .toMatchObject({ userId: expect.any(String), guestBatchId: null });

    // And: 最终 syncStatus === "synced"
    await expect
      .poll(async () => {
        const caps = await readCaptures(p);
        return caps.find((c) => c.localId === target!.localId)?.syncStatus;
      }, { timeout: 20000 })
      .toBe("synced");

    // And: 该 batchId 在 localStorage 中保持为同一值（多 tab 一致性锁）
    const lsBatchId = await p.evaluate(() => localStorage.getItem("voicenote:guestBatchId"));
    // 登录后 batch 可被清理（视实现），此处只校验"绑定期间"一致
    expect([initialBatchId, null]).toContain(lsBatchId);

    await fresh.close();
  });

  // ─── 场景 7.3 指令超时：forceCommand 保留，不退化为 diary ───
  test("场景7.3指令: FAB 上滑指令 + 离线 → toast '指令将在联网后执行' + forceCommand 保留", async () => {
    await page.goto(WEB);
    await waitForIdle(page);
    await context.setOffline(true);

    // 长按 FAB 然后上滑触发指令模式（具体手势由前端实现，使用粗略近似）
    const fab = page.locator('[data-testid="fab-record"], [aria-label*="录音"]').first();
    const box = await fab.boundingBox();
    if (!box) throw new Error("FAB not found");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(300);
    // 上滑触发指令
    await page.mouse.move(cx, cy - 150, { steps: 10 });
    await page.waitForTimeout(1500);
    await page.mouse.up();

    // Then: toast "指令已保存，将在联网后执行"
    await expect(
      page.locator('text=/指令已保存.*将在联网后执行|指令将在联网后执行/'),
    ).toBeVisible({ timeout: 15000 });

    // And: captures 中最新一条 forceCommand === true
    const caps = await readCaptures(page);
    const latest = caps
      .filter((c) => c.kind === "diary")
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
    expect(latest).toBeTruthy();
    expect(latest.forceCommand).toBe(true);

    await context.setOffline(false);
  });

  // ─── 场景 7.4：跨账号视图隔离 ───
  test("场景7.4: 账号 A 的本地条目不应在账号 B 视图中出现", async () => {
    // 账号 A
    const ctxA = await context.browser()!.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    const pA = await ctxA.newPage();
    const phoneA = `136${Date.now().toString().slice(-8)}`;
    await gw("POST", "/api/v1/auth/register", { phone: phoneA, password });
    await pA.goto(WEB);
    await waitForIdle(pA);
    await loginIfNeeded(pA);
    await pA.goto(`${WEB}/chat`);
    await waitForIdle(pA);
    await ctxA.setOffline(true);
    const inputA = pA.locator('textarea, input[type="text"]').first();
    await inputA.fill("账号A的私密消息");
    await pA.locator('button[aria-label*="发送"], button:has-text("发送")').first().click();
    await pA.waitForTimeout(500);
    const capsA = await readCaptures(pA);
    const msgA = capsA.find((c) => c.text === "账号A的私密消息");
    expect(msgA).toBeTruthy();
    await ctxA.close();

    // 账号 B — 全新 context（不共享 IndexedDB）
    const ctxB = await context.browser()!.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    const pB = await ctxB.newPage();
    const phoneB = `135${Date.now().toString().slice(-8)}`;
    await gw("POST", "/api/v1/auth/register", { phone: phoneB, password });
    await pB.goto(WEB);
    await waitForIdle(pB);
    await loginIfNeeded(pB);
    await pB.goto(`${WEB}/chat`);
    await waitForIdle(pB);

    // Then: 账号 B 的聊天视图**不**出现账号 A 的消息
    await expect(pB.locator('text="账号A的私密消息"')).toHaveCount(0);
    await expect(pB.locator('text="账号A的私密消息"')).not.toBeVisible();

    await ctxB.close();
  });

  // ─── 场景 7.5：synced 条目的 userId 不得被回放事件改写 ───
  test("场景7.5: auth:user-changed 事件不应污染 synced 条目的 userId", async () => {
    await page.goto(WEB);
    await waitForIdle(page);
    await loginIfNeeded(page);

    // Given: 正常发送一条消息 → 等其 synced
    await page.goto(`${WEB}/chat`);
    await waitForIdle(page);
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill("已同步的消息-7.5");
    await page.locator('button[aria-label*="发送"], button:has-text("发送")').first().click();
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.find((c) => c.text === "已同步的消息-7.5")?.syncStatus;
      }, { timeout: 15000 })
      .toBe("synced");

    const before = await readCaptures(page);
    const target = before.find((c) => c.text === "已同步的消息-7.5")!;
    const originalUserId = target.userId;
    expect(originalUserId).toBeTruthy();

    // When: 手动触发一次 auth:user-changed 事件（模拟异常回放 / token refresh 误触发）
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("auth:user-changed", {
          detail: { kind: "login", userId: "fake-user-xxx" },
        }),
      );
    });
    await page.waitForTimeout(2000);

    // Then: 该 synced 条目的 userId **保持原值**（未被事件覆盖）
    const after = await readCaptures(page);
    const stillTarget = after.find((c) => c.localId === target.localId)!;
    expect(stillTarget.userId).toBe(originalUserId);
    expect(stillTarget.syncStatus).toBe("synced");
  });

  // ─── §7.7 Phase 3 P0-1：initAuth 恢复时派发 auth:user-changed ───
  //
  // 场景核心：用户已登录 → 在同一 session 先产生 userId=null 的本地 capture
  // （模拟未归属遗留数据）→ 刷新页面 → 刷新后 capture 应被懒绑定归属到当前用户
  // 并在时间线上可见。
  //
  // 注意：此测试独立于 §7.2 的事件懒绑定机制，验证的是"刷新"这一特定入口
  // 不会让已登录用户的 null 条目永久失联。
  test("场景7.7: 刷新页面后 initAuth 派发 restored 事件，null 条目被懒绑定并可见", async () => {
    await page.goto(WEB);
    await waitForIdle(page);
    await loginIfNeeded(page);

    // Given: 当前已登录；通过测试挂载向 captureStore 注入一条 userId=null 的遗留条目
    //        （模拟上一个 guest session 留下来、尚未归属的数据）
    const injected = await page.evaluate(async () => {
      const store = (window as any).__captureStore;
      if (!store || typeof store.put !== "function") {
        return { ok: false, reason: "__captureStore not exposed" };
      }
      const batchId = (window as any).__peekGuestBatchId?.() ?? null;
      const localId = `e2e-7-7-${Date.now()}`;
      await store.put({
        localId,
        kind: "diary",
        text: "§7.7 未归属遗留日记",
        userId: null,
        guestBatchId: batchId,
        syncStatus: "captured",
        createdAt: Date.now(),
      });
      return { ok: true, localId, batchId };
    });

    expect(injected.ok, injected.reason ?? "captureStore unavailable").toBe(true);
    const { localId } = injected as { ok: true; localId: string; batchId: string | null };

    // When: 硬刷新页面
    await page.reload();
    await waitForIdle(page, 1500);

    // 等待 auth 恢复完成（轮询 __authReady 或等价 flag；超时 10s 即视为断链）
    await expect
      .poll(
        async () => {
          return await page.evaluate(() => {
            return (
              (window as any).__authReady === true ||
              !!(window as any).__getCurrentUser?.()
            );
          });
        },
        { timeout: 10000, intervals: [200, 400, 800] },
      )
      .toBe(true);

    // Then: 懒绑定完成后，capture 的 userId 应被归属到当前登录用户
    await expect
      .poll(
        async () => {
          const caps = await readCaptures(page);
          const hit = caps.find((c) => c.localId === localId);
          return hit?.userId ?? null;
        },
        { timeout: 10000, intervals: [300, 600, 1200] },
      )
      .not.toBeNull();

    const caps = await readCaptures(page);
    const bound = caps.find((c) => c.localId === localId)!;
    expect(bound.userId).not.toBeNull();
    expect(typeof bound.userId).toBe("string");

    // And: 账号视图过滤器放行该条目 → 时间线可见
    await page.goto(`${WEB}/timeline`);
    await waitForIdle(page);
    const visible = page.locator('text="§7.7 未归属遗留日记"');
    await expect(visible).toBeVisible({ timeout: 5000 });

    // And: 刷新后**不**应再有"未登录视图下该条目被屏蔽"的残留态
    //       （通过不出现"请先登录"提示隐含验证）
    await expect(page.locator('text="请先登录"')).toHaveCount(0);
  });

  // ─── §7.7 未登录刷新：不应派发 login ───
  test("场景7.7b: 未登录状态下刷新不应派发 auth:user-changed login", async () => {
    // 开一个独立的 incognito context 保证未登录
    const ctxGuest = await page.context().browser()!.newContext({
      viewport: { width: 390, height: 844 },
    });
    const pGuest = await ctxGuest.newPage();

    // 安装监听器：在任何脚本运行前先挂上 event 计数器
    await pGuest.addInitScript(() => {
      (window as any).__authEventLog = [];
      window.addEventListener("auth:user-changed", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        (window as any).__authEventLog.push(detail);
      });
    });

    await pGuest.goto(WEB);
    await waitForIdle(pGuest);

    // 未做登录操作 → reload
    await pGuest.reload();
    await waitForIdle(pGuest, 1500);

    // 断言：从未派发过 kind=login 事件
    const log = await pGuest.evaluate(() => (window as any).__authEventLog ?? []);
    const hasLogin = log.some((d: any) => d?.kind === "login");
    expect(hasLogin).toBe(false);

    await ctxGuest.close();
  });
});
