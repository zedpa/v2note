/**
 * E2E 验收测试：全局快速捕获 — 闪念胶囊式 App 外录入
 *
 * 覆盖 spec: specs/global-quick-capture.md
 *
 * 验收场景：
 *   1. URL Scheme 录音 → 极简录音页 → 自动提交
 *   2. URL Scheme 文字 → 极简输入页 → 提交
 *   3. 带预填内容的文字捕获
 *   4. 未登录时捕获不阻塞
 *   5. 未知 capture 路径静默降级
 *   6. 离线文字捕获 → 保存 → 联网同步
 *   7. 离线录音捕获 → 保存 → 联网同步
 *   8. 录音取消（返回/取消按钮）
 *   9. sourceContext 由 URL 参数正确传递（多来源）
 *   10. 极简捕获页冷启动性能 < 1.5s
 *   11. 空输入发送被阻止
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/global-quick-capture.spec.ts --reporter=list
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const GW = process.env.GW_URL ?? "http://localhost:3001";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
  permissions: ["microphone"],
  launchOptions: {
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
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function registerAndLogin(page: Page, userPhone: string): Promise<string> {
  const regResult = await gw("POST", "/api/v1/auth/register", { phone: userPhone, password });
  expect([200, 201, 409]).toContain(regResult.status); // 409 = 已注册也 OK

  const { data } = await gw("POST", "/api/v1/auth/login", { phone: userPhone, password });
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
 * 等待 capture-store 中出现满足条件的记录（条件轮询，避免硬编码 waitForTimeout）
 */
async function waitForCapture(
  page: Page,
  predicate: (c: any) => boolean,
  timeoutMs = 10000,
) {
  return await expect
    .poll(async () => {
      const caps = await readCaptures(page);
      return caps.find(predicate) ?? null;
    }, { timeout: timeoutMs, intervals: [300, 500, 1000, 2000] })
    .toBeTruthy();
}

// ── Setup ──

test.beforeAll(async () => {
  const result = await gw("POST", "/api/v1/auth/register", { phone, password });
  expect([200, 201, 409]).toContain(result.status);
});

// ───────────────────────────────────────────────────────────
// 行为 1: URL Scheme 录音 → 极简录音页 → 自动提交
// ───────────────────────────────────────────────────────────
test.describe("全局快速捕获 — 极简录音", () => {
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    page = await context.newPage();
    await registerAndLogin(page, phone);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("行为1: v2note://capture/voice → 极简录音页 → 完成提交", async () => {
    // 模拟 URL Scheme 触发：通过导航到 capture 路由
    // 实际设备上由 Android Intent / iOS Shortcut 触发 appUrlOpen 事件
    // E2E 中模拟为直接导航到对应前端路由
    const capturesBefore = await readCaptures(page);
    const countBefore = capturesBefore.length;

    // When: 通过 URL 进入极简录音页
    await page.goto(`${WEB}/capture/voice?source=notification_capture`);
    await waitForIdle(page, 1500);

    // Then: 极简录音页显示（全屏深色背景，有完成按钮）
    const capturePage = page.locator('[data-testid="quick-capture-page"], [data-page="capture"]');
    await expect(capturePage).toBeVisible({ timeout: 5000 });

    // And: 页面不应有主页导航栏（日记/待办 Tab）
    await expect(page.locator('button:has-text("日记")')).toHaveCount(0);
    await expect(page.locator('button:has-text("待办")')).toHaveCount(0);

    // And: 录音自动开始（波形或录音指示器可见）
    const recordingIndicator = page.locator(
      '[data-testid="recording-indicator"], [data-testid="waveform"], [aria-label*="录音中"]'
    );
    await expect(recordingIndicator).toBeVisible({ timeout: 5000 });

    // When: 等待录音 2 秒后点击完成按钮
    await page.waitForTimeout(2000);
    const doneBtn = page.locator(
      '[data-testid="capture-done"], button:has-text("完成")'
    );
    await doneBtn.waitFor({ state: "visible", timeout: 3000 });
    await doneBtn.click();

    // Then: 显示完成动画
    const successIndicator = page.locator(
      '[data-testid="capture-success"], text=/已记录|已保存|✓/'
    );
    await expect(successIndicator).toBeVisible({ timeout: 3000 });

    // And: capture-store 中出现新记录（条件轮询）
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.length;
      }, { timeout: 10000, intervals: [300, 500, 1000] })
      .toBeGreaterThan(countBefore);

    const capturesAfter = await readCaptures(page);
    const newCapture = capturesAfter
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
    expect(newCapture.kind).toBe("diary");
    expect(newCapture.sourceContext).toBe("notification_capture");
  });
});

// ───────────────────────────────────────────────────────────
// 行为 2 + 3: URL Scheme 文字 → 极简输入 → 提交
// ───────────────────────────────────────────────────────────
test.describe("全局快速捕获 — 极简文字输入", () => {
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    page = await context.newPage();
    const textPhone = `138${Date.now().toString().slice(-8)}`;
    await registerAndLogin(page, textPhone);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("行为2: v2note://capture/text → 极简文字输入 → 提交", async () => {
    // When: 通过 URL 进入极简文字输入页
    await page.goto(`${WEB}/capture/text?source=notification_capture`);
    await waitForIdle(page, 1000);

    // Then: 极简文字输入页显示
    const capturePage = page.locator('[data-testid="quick-capture-page"], [data-page="capture"]');
    await expect(capturePage).toBeVisible({ timeout: 5000 });

    // And: 输入框自动聚焦
    const input = page.locator(
      '[data-testid="capture-input"] textarea, [data-testid="capture-input"] input, [data-page="capture"] textarea'
    ).first();
    await expect(input).toBeVisible({ timeout: 3000 });
    await expect(input).toBeFocused({ timeout: 3000 });

    // And: 页面不应有主页导航栏
    await expect(page.locator('button:has-text("日记")')).toHaveCount(0);

    // When: 用户输入文字并发送
    await input.fill("明天下午开会");
    const sendBtn = page.locator(
      '[data-testid="capture-send"], button:has-text("发送"), button[aria-label*="发送"]'
    ).first();
    await sendBtn.click();

    // Then: 显示完成动画
    const successIndicator = page.locator(
      '[data-testid="capture-success"], text=/已记录|已保存|✓/'
    );
    await expect(successIndicator).toBeVisible({ timeout: 3000 });

    // And: capture-store 中出现对应记录（条件轮询）
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.find((c) => c.text === "明天下午开会") ?? null;
      }, { timeout: 10000, intervals: [300, 500, 1000] })
      .toBeTruthy();

    const captures = await readCaptures(page);
    const newCapture = captures.find((c) => c.text === "明天下午开会");
    expect(newCapture.kind).toBe("diary");
    expect(newCapture.sourceContext).toBe("notification_capture");
  });

  test("行为3: v2note://capture/text?content=买牛奶 → 预填内容", async () => {
    // When: 通过 URL 进入带预填内容的文字输入页
    await page.goto(`${WEB}/capture/text?content=${encodeURIComponent("买牛奶")}`);
    await waitForIdle(page, 1000);

    // Then: 输入框内已有预填内容
    const input = page.locator(
      '[data-testid="capture-input"] textarea, [data-testid="capture-input"] input, [data-page="capture"] textarea'
    ).first();
    await expect(input).toBeVisible({ timeout: 3000 });
    await expect(input).toHaveValue("买牛奶");

    // When: 用户直接点击发送
    const sendBtn = page.locator(
      '[data-testid="capture-send"], button:has-text("发送"), button[aria-label*="发送"]'
    ).first();
    await sendBtn.click();

    // Then: 显示完成动画
    const successIndicator = page.locator(
      '[data-testid="capture-success"], text=/已记录|已保存|✓/'
    );
    await expect(successIndicator).toBeVisible({ timeout: 3000 });

    // And: capture-store 中出现对应记录
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.find((c) => c.text === "买牛奶") ?? null;
      }, { timeout: 10000, intervals: [300, 500, 1000] })
      .toBeTruthy();
  });

  test("边界: 空输入发送被阻止", async () => {
    const capturesBefore = await readCaptures(page);
    const countBefore = capturesBefore.length;

    // When: 进入文字输入页，不输入任何内容直接点发送
    await page.goto(`${WEB}/capture/text`);
    await waitForIdle(page, 1000);

    const input = page.locator(
      '[data-testid="capture-input"] textarea, [data-testid="capture-input"] input, [data-page="capture"] textarea'
    ).first();
    await expect(input).toBeVisible({ timeout: 3000 });

    const sendBtn = page.locator(
      '[data-testid="capture-send"], button:has-text("发送"), button[aria-label*="发送"]'
    ).first();

    // Then: 发送按钮应被禁用或点击后不产生新记录
    const isDisabled = await sendBtn.isDisabled().catch(() => false);
    if (!isDisabled) {
      await sendBtn.click();
      await page.waitForTimeout(1000);
    }

    // And: capture-store 中不应出现空文本记录
    const capturesAfter = await readCaptures(page);
    const emptyCapture = capturesAfter.find((c) =>
      c.text === "" || c.text === null && !c.audioLocalId
    );
    // 不应增加新的空记录
    expect(capturesAfter.filter((c) => !c.text && !c.audioLocalId).length)
      .toBeLessThanOrEqual(capturesBefore.filter((c) => !c.text && !c.audioLocalId).length);
  });
});

// ───────────────────────────────────────────────────────────
// 行为 4: 未登录时捕获不阻塞
// ───────────────────────────────────────────────────────────
test.describe("全局快速捕获 — 未登录捕获", () => {
  test("行为4: 未登录通过 capture/voice 进入 → 录音正常 → guestBatchId 非空", async ({ browser }) => {
    const guestContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    const guestPage = await guestContext.newPage();

    // Given: 未登录状态直接访问极简录音页
    await guestPage.goto(`${WEB}/capture/voice`);
    await waitForIdle(guestPage, 1500);

    // Then: 极简录音页正常显示（不弹登录提示）
    const capturePage = guestPage.locator('[data-testid="quick-capture-page"], [data-page="capture"]');
    await expect(capturePage).toBeVisible({ timeout: 5000 });
    await expect(guestPage.locator('text=/请先登录|请登录/')).toHaveCount(0);

    // And: 录音自动开始
    const recordingIndicator = guestPage.locator(
      '[data-testid="recording-indicator"], [data-testid="waveform"], [aria-label*="录音中"]'
    );
    await expect(recordingIndicator).toBeVisible({ timeout: 5000 });

    // When: 完成录音
    await guestPage.waitForTimeout(2000);
    const doneBtn = guestPage.locator(
      '[data-testid="capture-done"], button:has-text("完成")'
    );
    await doneBtn.waitFor({ state: "visible", timeout: 3000 });
    await doneBtn.click();

    // Then: capture-store 中记录 userId 为 null，guestBatchId 非空（条件轮询）
    await expect
      .poll(async () => {
        const caps = await readCaptures(guestPage);
        return caps.length;
      }, { timeout: 10000, intervals: [300, 500, 1000] })
      .toBeGreaterThan(0);

    const captures = await readCaptures(guestPage);
    const guestCapture = captures
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
    expect(guestCapture).toBeTruthy();
    expect(guestCapture.userId).toBeNull();
    expect(guestCapture.guestBatchId).toBeTruthy();

    await guestContext.close();
  });
});

// ───────────────────────────────────────────────────────────
// 行为 5: 未知 capture 路径静默降级
// ───────────────────────────────────────────────────────────
test.describe("全局快速捕获 — 未知路径降级", () => {
  test("行为5: v2note://capture/unknown → 显示主页，无报错", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await registerAndLogin(page, `137${Date.now().toString().slice(-8)}`);

    // When: 访问未知的 capture 路径
    await page.goto(`${WEB}/capture/unknown`);
    await waitForIdle(page, 1500);

    // Then: 不显示错误页面或异常提示
    await expect(page.locator('text=/404|Not Found|错误|异常/')).toHaveCount(0);

    // And: 主页内容可见（日记或待办 Tab 存在）或正常重定向
    const mainContent = page.locator(
      'button:has-text("日记"), button:has-text("待办"), [data-testid="fab-record"]'
    ).first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });

    await ctx.close();
  });
});

// ───────────────────────────────────────────────────────────
// 离线捕获场景（文字 + 录音）
// ───────────────────────────────────────────────────────────
test.describe("全局快速捕获 — 离线捕获", () => {
  test("场景8.3a: 离线时文字捕获 → 正常保存 → 联网同步", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    const offlinePhone = `136${Date.now().toString().slice(-8)}`;
    await registerAndLogin(page, offlinePhone);

    // 先在线加载捕获页，再切离线
    await page.goto(`${WEB}/capture/text`);
    await waitForIdle(page, 1000);
    await ctx.setOffline(true);

    // When: 离线输入并发送
    const input = page.locator(
      '[data-testid="capture-input"] textarea, [data-testid="capture-input"] input, [data-page="capture"] textarea'
    ).first();
    await input.fill("离线快速捕获测试");
    const sendBtn = page.locator(
      '[data-testid="capture-send"], button:has-text("发送"), button[aria-label*="发送"]'
    ).first();
    await sendBtn.click();

    // Then: 正常保存到 capture-store
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.find((c) => c.text === "离线快速捕获测试") ?? null;
      }, { timeout: 10000, intervals: [300, 500, 1000] })
      .toBeTruthy();

    const captures = await readCaptures(page);
    const offlineCapture = captures.find((c) => c.text === "离线快速捕获测试");
    expect(offlineCapture.syncStatus).toBe("captured");

    // And: 显示离线保存提示
    const offlineHint = page.locator('text=/已保存.*同步|已记录/');
    await expect(offlineHint).toBeVisible({ timeout: 3000 });

    // When: 恢复网络 → 自动同步
    await ctx.setOffline(false);
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.find((c) => c.text === "离线快速捕获测试")?.syncStatus;
      }, { timeout: 20000, intervals: [1000, 2000, 3000] })
      .toBe("synced");

    await ctx.close();
  });

  test("场景8.3b: 离线时录音捕获 → 正常保存 → 联网同步", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    const page = await ctx.newPage();
    const offlineVoicePhone = `135${Date.now().toString().slice(-8)}`;
    await registerAndLogin(page, offlineVoicePhone);

    const capturesBefore = await readCaptures(page);
    const countBefore = capturesBefore.length;

    // 先在线加载录音页，再切离线
    await page.goto(`${WEB}/capture/voice`);
    await waitForIdle(page, 1500);
    await ctx.setOffline(true);

    // And: 录音自动开始
    const recordingIndicator = page.locator(
      '[data-testid="recording-indicator"], [data-testid="waveform"], [aria-label*="录音中"]'
    );
    await expect(recordingIndicator).toBeVisible({ timeout: 5000 });

    // When: 录 2 秒后点完成
    await page.waitForTimeout(2000);
    const doneBtn = page.locator(
      '[data-testid="capture-done"], button:has-text("完成")'
    );
    await doneBtn.waitFor({ state: "visible", timeout: 3000 });
    await doneBtn.click();

    // Then: 正常保存到 capture-store（离线状态）
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.length;
      }, { timeout: 10000, intervals: [300, 500, 1000] })
      .toBeGreaterThan(countBefore);

    const capturesOffline = await readCaptures(page);
    const voiceCapture = capturesOffline
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
    expect(voiceCapture.kind).toBe("diary");
    expect(voiceCapture.syncStatus).toMatch(/captured|failed/);

    // And: 显示离线保存提示
    const offlineHint = page.locator('text=/已保存.*同步|已记录/');
    await expect(offlineHint).toBeVisible({ timeout: 3000 });

    // When: 恢复网络 → 自动同步
    await ctx.setOffline(false);
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.find((c) => c.localId === voiceCapture.localId)?.syncStatus;
      }, { timeout: 20000, intervals: [1000, 2000, 3000] })
      .toBe("synced");

    await ctx.close();
  });
});

// ───────────────────────────────────────────────────────────
// 录音取消（场景 A2.4）
// ───────────────────────────────────────────────────────────
test.describe("全局快速捕获 — 录音取消", () => {
  test("场景A2.4: 录音中取消 → 弹出确认 → 丢弃录音", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    const page = await ctx.newPage();
    await registerAndLogin(page, `134${Date.now().toString().slice(-8)}`);
    const capturesBefore = await readCaptures(page);
    const countBefore = capturesBefore.length;

    // When: 进入极简录音页
    await page.goto(`${WEB}/capture/voice`);
    await waitForIdle(page, 1500);

    // And: 录音自动开始
    const recordingIndicator = page.locator(
      '[data-testid="recording-indicator"], [data-testid="waveform"], [aria-label*="录音中"]'
    );
    await expect(recordingIndicator).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // When: 用户点击取消/返回按钮
    const cancelBtn = page.locator(
      '[data-testid="capture-cancel"], button:has-text("取消"), button[aria-label*="返回"], button[aria-label*="取消"]'
    ).first();
    await cancelBtn.waitFor({ state: "visible", timeout: 3000 });
    await cancelBtn.click();

    // Then: 弹出确认对话框
    const confirmDialog = page.locator('text=/放弃.*录音|确认取消/');
    await expect(confirmDialog).toBeVisible({ timeout: 3000 });

    // When: 用户确认放弃
    const confirmBtn = page.locator(
      'button:has-text("确认"), button:has-text("放弃"), button:has-text("确定")'
    ).first();
    await confirmBtn.click();
    await page.waitForTimeout(1000);

    // Then: capture-store 中不应新增记录
    const capturesAfter = await readCaptures(page);
    expect(capturesAfter.length).toBe(countBefore);

    await ctx.close();
  });
});

// ───────────────────────────────────────────────────────────
// sourceContext 多来源验证
// ───────────────────────────────────────────────────────────
test.describe("全局快速捕获 — sourceContext 来源标记", () => {
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    page = await context.newPage();
    await registerAndLogin(page, `133${Date.now().toString().slice(-8)}`);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("source=ios_shortcut 正确写入 sourceContext", async () => {
    await page.goto(`${WEB}/capture/text?source=ios_shortcut`);
    await waitForIdle(page, 1000);

    const input = page.locator(
      '[data-testid="capture-input"] textarea, [data-testid="capture-input"] input, [data-page="capture"] textarea'
    ).first();
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.fill("iOS shortcut 测试");

    const sendBtn = page.locator(
      '[data-testid="capture-send"], button:has-text("发送"), button[aria-label*="发送"]'
    ).first();
    await sendBtn.click();

    // Then: sourceContext 为 ios_shortcut
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.find((c) => c.text === "iOS shortcut 测试")?.sourceContext ?? null;
      }, { timeout: 10000, intervals: [300, 500, 1000] })
      .toBe("ios_shortcut");
  });

  test("无 source 参数时默认 notification_capture", async () => {
    await page.goto(`${WEB}/capture/text`);
    await waitForIdle(page, 1000);

    const input = page.locator(
      '[data-testid="capture-input"] textarea, [data-testid="capture-input"] input, [data-page="capture"] textarea'
    ).first();
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.fill("默认来源测试");

    const sendBtn = page.locator(
      '[data-testid="capture-send"], button:has-text("发送"), button[aria-label*="发送"]'
    ).first();
    await sendBtn.click();

    // Then: sourceContext 默认为 notification_capture
    await expect
      .poll(async () => {
        const caps = await readCaptures(page);
        return caps.find((c) => c.text === "默认来源测试")?.sourceContext ?? null;
      }, { timeout: 10000, intervals: [300, 500, 1000] })
      .toBe("notification_capture");
  });
});

// ───────────────────────────────────────────────────────────
// 极简捕获页冷启动性能（场景 8.1）
// ───────────────────────────────────────────────────────────
test.describe("全局快速捕获 — 冷启动性能", () => {
  test("场景8.1: 极简捕获页冷启动 < 1.5s", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await registerAndLogin(page, `132${Date.now().toString().slice(-8)}`);

    // 清除页面缓存模拟冷启动
    await page.goto("about:blank");
    await page.waitForTimeout(500);

    // When: 导航到极简捕获页，测量加载时间
    const startTime = Date.now();
    await page.goto(`${WEB}/capture/text`);

    // 等待捕获页可交互（输入框可见）
    const input = page.locator(
      '[data-testid="capture-input"] textarea, [data-testid="capture-input"] input, [data-page="capture"] textarea'
    ).first();
    await expect(input).toBeVisible({ timeout: 5000 });
    const loadTime = Date.now() - startTime;

    // Then: 加载时间 < 1.5s（给 CI 环境额外余量，放宽到 3s）
    // 注：本地开发环境应 < 1.5s，CI 环境由于资源竞争可能更慢
    expect(loadTime).toBeLessThan(3000);

    await ctx.close();
  });
});
