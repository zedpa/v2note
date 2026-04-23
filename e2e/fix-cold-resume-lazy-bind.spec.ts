/**
 * Fix: 冷启动懒绑定生命周期补完（§7.7 + §8）
 *
 * 覆盖 spec: specs/fix-cold-resume-lazy-bind.md
 * 父 spec: specs/fix-cold-resume-silent-loss.md
 *
 * §8 验收核心：长时间未用 → 打开 App → 直接录音 / 打字 → 即便 WS 尚未就绪，
 * 数据也必须（1）立刻本地落地（2）懒绑定回填 userId（3）WS OPEN 后自动推送 synced。
 *
 * 验收路径（E2E 视角）：
 *   1. 模拟 WS 永不 OPEN（通过 addInitScript 拦截 WebSocket 构造）
 *   2. 登录 → 注入一条 userId=null 的 guest capture（模拟冷启动阶段落地）
 *   3. 轮询 ≤ 3s 期望 userId 已回填（§8.1 懒绑定不被 sessionOk 门控）
 *   4. 放行 WS（移除拦截 → reload 或 触发新的 connect）
 *   5. 轮询 ≤ 12s 期望 syncStatus='synced'（§8.2 WS open 边沿触发 triggerSync）
 *
 * 前置条件：
 *   - pnpm dev（前端 localhost:3000）
 *   - cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/fix-cold-resume-lazy-bind.spec.ts --headed --reporter=list
 */
import { test, expect, type Page } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const GW = process.env.GW_URL ?? "http://localhost:3001";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

// 每个 test 用独立账号避免跨测试状态污染
function freshPhone() {
  return `139${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0")}`.slice(0, 11);
}
const password = "test123456";

async function waitForIdle(page: Page, ms = 800) {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function gw(method: string, path: string, body?: any) {
  const res = await fetch(`${GW}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => null);
}

async function loginIfNeeded(page: Page, phone: string) {
  const loginInput = page
    .locator('input[type="tel"], input[placeholder*="手机"]')
    .first();
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
  const firstRunHint = page.locator("text=点击任意位置继续").first();
  if (await firstRunHint.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.mouse.click(195, 400);
    await waitForIdle(page, 500);
  }
}

/**
 * 拦截 WebSocket 构造函数，让 `new WebSocket(...)` 返回一个永不 OPEN 的伪对象。
 * 等价于"WS 建连失败 / 超时" → `ensureWs()` 返回 false → `ensureGatewaySession=false`。
 *
 * 通过 `window.__e2eBlockWs = false` 随后解除拦截（新建的 WebSocket 会走真实实现）。
 */
async function installWsBlocker(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __e2eBlockWs: boolean }).__e2eBlockWs = true;
    const RealWebSocket = window.WebSocket;
    class FakeBlockedWebSocket {
      url: string;
      readyState = 0; // CONNECTING — 永远不进 OPEN
      onopen: ((e: Event) => void) | null = null;
      onclose: ((e: CloseEvent) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor(url: string) {
        this.url = url;
      }
      send() {
        /* swallow */
      }
      close() {
        this.readyState = 3;
        try {
          this.onclose?.(new CloseEvent("close"));
        } catch {
          /* noop */
        }
      }
      addEventListener() {
        /* noop */
      }
      removeEventListener() {
        /* noop */
      }
    }
    // 必须用 function（非箭头函数），否则 `new WebSocket(url)` 会抛
    // TypeError: WebSocket is not a constructor（箭头函数不能用作构造函数）
    (window as unknown as { WebSocket: typeof WebSocket }).WebSocket = function(
      url: string,
    ) {
      const w = window as unknown as { __e2eBlockWs: boolean };
      if (w.__e2eBlockWs) {
        return new FakeBlockedWebSocket(url) as unknown as WebSocket;
      }
      return new RealWebSocket(url);
    } as unknown as typeof WebSocket;
    // 保留构造常量
    (window as unknown as { WebSocket: typeof WebSocket }).WebSocket.CONNECTING = 0;
    (window as unknown as { WebSocket: typeof WebSocket }).WebSocket.OPEN = 1;
    (window as unknown as { WebSocket: typeof WebSocket }).WebSocket.CLOSING = 2;
    (window as unknown as { WebSocket: typeof WebSocket }).WebSocket.CLOSED = 3;
  });
}

/**
 * 解除 WS 拦截。**同一页生命周期内**不会让已挂载的 gateway-client 重连（其内部
 * reconnect 循环使用闭包中的 FakeBlockedWebSocket 引用），因此调用方通常需要
 * 配合 `page.reload()` 或主动 `getGatewayClient().disconnect()` + `.connect()` 让
 * 新建的 WebSocket 走真实实现。
 */
async function releaseWsBlocker(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __e2eBlockWs: boolean }).__e2eBlockWs = false;
  });
}

async function readCapture(page: Page, localId: string) {
  return await page.evaluate(
    (id) =>
      new Promise<any>((resolve) => {
        const req = indexedDB.open("v2note-capture");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("captures")) return resolve(null);
          const tx = db.transaction("captures", "readonly");
          const os = tx.objectStore("captures");
          const getReq = os.get(id);
          getReq.onsuccess = () => resolve(getReq.result ?? null);
          getReq.onerror = () => resolve(null);
        };
      }),
    localId,
  );
}

/**
 * 轮询直到 predicate 对最新 capture 返回 true；超时抛错。
 */
async function waitForCapture(
  page: Page,
  localId: string,
  predicate: (c: any) => boolean,
  timeoutMs: number,
  label: string,
) {
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await readCapture(page, localId);
    if (last && predicate(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `[${label}] waitForCapture timed out after ${timeoutMs}ms. last=${JSON.stringify(last)}`,
  );
}

// ───────────────────────────────────────────────────────────────
// §8 验收
// ───────────────────────────────────────────────────────────────

test.describe("regression: fix-cold-resume-silent-loss §8 懒绑定网络无关 + WS open 触发", () => {
  test("should_lazy_bind_and_sync_when_ws_blocked_then_released_on_cold_start [§8.1 + §8.2 + §8.3]", async ({
    page,
  }) => {
    const phone = freshPhone();
    await gw("POST", "/api/v1/auth/register", { phone, password });

    // 关键 1：在页面加载前安装 WS 拦截，模拟"长时间未用 → WS 永不 OPEN"
    await installWsBlocker(page);

    await page.goto(WEB);
    await waitForIdle(page);

    // 等待 __authReady 标志（SyncBootstrap 会在 initAuth 完成后置位）
    // 必须在 loginIfNeeded 之前等待，否则页面可能仍在 authLoading 状态，
    // 登录表单尚未渲染，loginIfNeeded 的 3s 超时会错过登录窗口。
    await page.waitForFunction(
      () => (window as unknown as { __authReady?: boolean }).__authReady === true,
      { timeout: 10_000 },
    );

    await loginIfNeeded(page, phone);
    await waitForIdle(page, 2000);

    // 断言：测试钩子已挂载
    const helpersReady = await page.evaluate(() => {
      const w = window as unknown as {
        __captureStore?: { put?: unknown; get?: unknown };
        __peekGuestBatchId?: () => string | null;
        __getCurrentUser?: () => { id: string } | null;
      };
      return {
        hasPut: typeof w.__captureStore?.put === "function",
        hasPeek: typeof w.__peekGuestBatchId === "function",
        hasGetUser: typeof w.__getCurrentUser === "function",
      };
    });
    expect(helpersReady.hasPut, "window.__captureStore.put 未挂载").toBe(true);
    expect(helpersReady.hasPeek, "window.__peekGuestBatchId 未挂载").toBe(true);
    expect(helpersReady.hasGetUser, "window.__getCurrentUser 未挂载").toBe(true);

    // 注入一条 "上一会话遗留 + WS 未就绪时落地" 的 capture：userId=null + guestBatchId=<当前 batch>
    const injection = await page.evaluate(async () => {
      const w = window as unknown as {
        __captureStore: {
          put: (input: {
            localId: string;
            kind: "diary" | "chat" | "voice";
            text?: string | null;
            userId?: string | null;
            guestBatchId?: string | null;
            syncStatus?: string;
            createdAt?: number | string;
            sourceContext?: string;
          }) => Promise<{ localId: string; guestBatchId: string | null }>;
        };
        __getCurrentUser: () => { id: string } | null;
      };
      const localId = `e2e-s8-${Date.now()}`;
      const res = await w.__captureStore.put({
        localId,
        kind: "diary",
        text: "冷启动懒绑定验收：WS 未就绪时落地的 capture",
        userId: null,
        guestBatchId: null, // 让 e2ePut 自愈生成 batch（模拟 guest-session 已持久化）
        syncStatus: "captured",
        createdAt: Date.now(),
        sourceContext: "timeline",
      });
      return { localId: res.localId, batch: res.guestBatchId, user: w.__getCurrentUser()?.id ?? null };
    });
    expect(injection.user, "登录后 __getCurrentUser() 应非空").toBeTruthy();
    expect(injection.batch, "__captureStore.put 应返回/自愈 guestBatchId").toBeTruthy();

    // ── §8.1：懒绑定应在 WS 拦截中仍然执行，回填 userId ──
    // 触发一次同步扫描（派发 capture:created → triggerSync）
    await page.evaluate(() => {
      window.dispatchEvent(new Event("capture:created"));
    });

    const boundCapture = await waitForCapture(
      page,
      injection.localId,
      (c) => c.userId === injection.user && c.syncStatus === "captured",
      6_000, // worker debounce 200ms + ensureGatewaySession 可能等到 refreshAuth 完成（~几 s）
      "§8.1 lazy-bind",
    );
    expect(
      boundCapture.userId,
      "§8.1: WS 未就绪时懒绑定仍必须把 userId 从 null 回填为登录用户",
    ).toBe(injection.user);
    expect(
      boundCapture.guestBatchId,
      "§8.1: 懒绑定完成后 guestBatchId 应被清空",
    ).toBeNull();
    expect(
      boundCapture.syncStatus,
      "§8.1: session 不 OK 时不应推送，保持 captured",
    ).toBe("captured");

    // ── §8.2 + §8.3：放行 WS 后 onStatusChange('open') 应触发 triggerSync，最终 synced ──
    await releaseWsBlocker(page);
    // 让 gateway-client 重建连接：断开当前 fake WS，重新 connect 走真实实现
    await page.evaluate(() => {
      const w = window as unknown as {
        __gatewayClient?: { disconnect: () => void; connect: () => void };
      };
      w.__gatewayClient?.disconnect();
      w.__gatewayClient?.connect();
    });

    const syncedCapture = await waitForCapture(
      page,
      injection.localId,
      (c) => c.syncStatus === "synced" && typeof c.serverId === "string",
      15_000,
      "§8.2 ws-open-trigger-sync",
    );
    expect(
      syncedCapture.syncStatus,
      "§8.2: WS 进入 OPEN 后 onStatusChange 应触发 triggerSync，capture 最终 synced",
    ).toBe("synced");
    expect(
      syncedCapture.serverId,
      "§8.2: synced capture 应携带服务端 serverId",
    ).toBeTruthy();
  });

  test("should_not_lose_text_typed_before_ws_open [§8.3 用户现场症状]", async ({
    page,
  }) => {
    // 用户报告："长时间未用 → 打开 → 直接文字输入 → 发送 → 丢失"
    // 本测试不通过真实 UI 点击（避免 onboarding/引导噪声），而是通过测试钩子
    // 模拟同样的底层数据路径：登录后 WS 未就绪 → captureStore.create（经 __captureStore.put）
    // → 放行 WS → 期望最终 synced。与上一个用例的差别：guestBatchId 显式为 null，
    // 验证 e2ePut 的"自愈 batch"路径确实被 orchestrator 认作当前 session。
    const phone = freshPhone();
    await gw("POST", "/api/v1/auth/register", { phone, password });

    await installWsBlocker(page);
    await page.goto(WEB);
    await waitForIdle(page);

    // 先等 auth 初始化完成，确保登录表单已渲染
    await page.waitForFunction(
      () => (window as unknown as { __authReady?: boolean }).__authReady === true,
      { timeout: 10_000 },
    );

    await loginIfNeeded(page, phone);
    await waitForIdle(page, 2000);

    const injection = await page.evaluate(async () => {
      const w = window as unknown as {
        __captureStore: {
          put: (input: {
            localId: string;
            kind: "diary";
            text: string;
            userId: null;
            guestBatchId: null;
            syncStatus: "captured";
            createdAt: number;
            sourceContext: "timeline";
          }) => Promise<{ localId: string; guestBatchId: string | null }>;
        };
        __getCurrentUser: () => { id: string } | null;
      };
      const localId = `e2e-s8-chat-${Date.now()}`;
      const res = await w.__captureStore.put({
        localId,
        kind: "diary",
        text: "发送测试：WS 未就绪但不应丢失",
        userId: null,
        guestBatchId: null,
        syncStatus: "captured",
        createdAt: Date.now(),
        sourceContext: "timeline",
      });
      return { localId: res.localId, user: w.__getCurrentUser()?.id ?? null };
    });
    expect(injection.user).toBeTruthy();

    // 触发同步；WS 还在被拦截，期望仍能懒绑定
    await page.evaluate(() =>
      window.dispatchEvent(new Event("capture:created")),
    );

    const bound = await waitForCapture(
      page,
      injection.localId,
      (c) => c.userId === injection.user,
      6_000,
      "§8.3 chat lazy-bind",
    );
    expect(bound.userId).toBe(injection.user);

    // 放行 WS，期望 chat capture 最终 synced
    await releaseWsBlocker(page);
    await page.evaluate(() => {
      const w = window as unknown as {
        __gatewayClient?: { disconnect: () => void; connect: () => void };
      };
      w.__gatewayClient?.disconnect();
      w.__gatewayClient?.connect();
    });

    const synced = await waitForCapture(
      page,
      injection.localId,
      (c) => c.syncStatus === "synced",
      15_000,
      "§8.3 chat synced",
    );
    expect(synced.syncStatus).toBe("synced");
  });
});
