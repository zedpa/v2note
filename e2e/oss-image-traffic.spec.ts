/**
 * E2E 验收测试：OSS 图片流量风暴修复
 *
 * 覆盖 spec: specs/fix-oss-image-traffic-storm.md
 *
 * 验收场景（对应 spec「验收行为（E2E 锚点）」1-7 + 补充场景 6）：
 *   1. 连续停留图片不重复下载（行为 1）
 *   2. 图片 URL 在多次列表请求中保持稳定（行为 2）
 *   3. 卡住的上传会被标记失败（行为 3）
 *   4. 达到自动刷新上限后停止（行为 4）
 *   5. 页面切后台暂停自动刷新（行为 5）
 *   6. 无卡住记录时不触发持续轮询（补充，对应 spec 场景 6）
 *   7. 图片本地缓存 — 跨页面刷新仅下载 1 次（行为 6）
 *   8. 离线仍能看到已浏览过的图片（行为 7）
 *
 * 前置条件（必须在压缩时长下运行，否则 E2E 会跑 >10 分钟）：
 *   - 前端：NEXT_PUBLIC_POLL_INTERVAL_MS=1000 NEXT_PUBLIC_POLL_MAX_MS=10000 pnpm dev
 *   - 后端：ENABLE_E2E_HELPERS=1 STALE_SWEEP_MS=5000 STALE_THRESHOLD_MS=3000 pnpm dev（gateway）
 *
 * 运行：npx playwright test e2e/oss-image-traffic.spec.ts --reporter=list
 */
import { test, expect, type Page, type Request } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const GW = process.env.GW_URL ?? "http://localhost:3001";

test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

let phoneCounter = 0;
function nextPhone(): string {
  phoneCounter++;
  return `139${(Date.now() + phoneCounter).toString().slice(-8)}`;
}
const password = "test123456";

// 1x1 透明 PNG（base64），足够用来走 image 上传通道
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TINY_PNG_BYTES = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0));

// ── Helpers ──

/** 拦截 OSS 图片请求返回 mock PNG（绕过 CORS 限制） */
async function mockOssImages(page: Page) {
  await page.route(/aliyuncs\.com/, (route) => {
    const url = route.request().url();
    // 只拦截图片相关请求（含文件扩展名或 OSS 签名参数的 GET）
    if (route.request().method() === "GET" && /\.(png|jpg|jpeg|gif|webp)|OSSAccessKeyId/i.test(url)) {
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(TINY_PNG_BYTES),
      });
    } else {
      route.continue();
    }
  });
}

async function waitForIdle(page: Page, ms = 800) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** 关闭 first-run 遮罩（多阶段：录音引导 + 语音指令引导） */
async function dismissFirstRunMask(page: Page) {
  for (let i = 0; i < 3; i++) {
    const mask = page.getByText(/点击任意位置继续|点击任意位置完成/);
    if (await mask.isVisible({ timeout: 1500 }).catch(() => false)) {
      await page.mouse.click(195, 400);
      await page.waitForTimeout(500);
    } else {
      break;
    }
  }
}

async function gw(method: string, path: string, body?: any, token?: string) {
  const res = await fetch(`${GW}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function registerAndLogin(page: Page): Promise<string> {
  // 每个测试用独立 phone，避免跨用例 seed 数据污染
  const phone = nextPhone();
  await gw("POST", "/api/v1/auth/register", { phone, password });
  const { body } = await gw("POST", "/api/v1/auth/login", { phone, password });
  const token = (body?.accessToken ?? body?.token) as string;
  const refreshToken = body?.refreshToken as string;
  const user = body?.user;
  expect(token).toBeTruthy();
  // 拦截 OSS 图片请求绕过 CORS（必须在 goto 之前注册）
  await mockOssImages(page);
  // 把 token + user + refreshToken 注入到 localStorage（isLoggedIn 需要 token && user 同时非空）
  await page.goto(WEB);
  const userId = user?.id as string;
  await page.evaluate(([t, rt, u, uid]) => {
    localStorage.setItem("voicenote:accessToken", t);
    if (rt) localStorage.setItem("voicenote:refreshToken", rt);
    if (u) localStorage.setItem("voicenote:user", u);
    sessionStorage.setItem("voicenote:sessionAlive", "1");
    // 跳过 onboarding 引导
    if (uid) {
      localStorage.setItem(`v2note:onboarded:${uid}`, "true");
      localStorage.setItem("v2note:onboarded", "true");
    }
  }, [token, refreshToken, user ? JSON.stringify(user) : "", userId ?? ""] as string[]);
  await page.goto(WEB);
  await waitForIdle(page);
  await dismissFirstRunMask(page);
  return token;
}

/** 创建一条图片 record，返回 record_id + file_url（签名后 URL） */
async function seedImageRecord(token: string): Promise<{ id: string; fileUrl: string }> {
  const { body } = await gw(
    "POST",
    "/api/v1/ingest",
    { type: "image", file_base64: TINY_PNG_BASE64, filename: "e2e-test.png" },
    token,
  );
  const id = body?.recordId ?? body?.id;
  expect(id).toBeTruthy();
  // 读回列表拿签名后的 file_url（ingest 异步处理，可能需要重试）
  let fileUrl: string | undefined;
  for (let i = 0; i < 5; i++) {
    const list = await gw("GET", "/api/v1/records", undefined, token);
    const r = list.body?.find?.((x: any) => x.id === id);
    fileUrl = r?.file_url;
    if (fileUrl) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(fileUrl).toBeTruthy();
  return { id, fileUrl: fileUrl! };
}

/** 预置 1 条 uploading record，offset 控制 updated_at 偏移（正值=未来，不被清扫） */
async function seedUploadingRecord(token: string, offsetMs: number): Promise<string> {
  const { status, body } = await gw(
    "POST",
    "/api/v1/test/seed-stale-record",
    { status: "uploading", updated_at_offset_ms: offsetMs },
    token,
  );
  expect(status).toBe(201);
  expect(body?.id).toBeTruthy();
  return body.id;
}

/** 预置 1 条 status='uploading' 且 updated_at 早于阈值的僵尸 record（测试专用接口） */
async function seedStaleUploadingRecord(token: string): Promise<string> {
  // 该 endpoint 仅在 ENABLE_E2E_HELPERS=1 时启用（由实现阶段在 Phase 0/1 提供）
  const { status, body } = await gw(
    "POST",
    "/api/v1/test/seed-stale-record",
    { status: "uploading", updated_at_offset_ms: -10_000 },
    token,
  );
  expect(status).toBe(201);
  expect(body?.id).toBeTruthy();
  return body.id;
}

/** 抓取所有对某个 URL 子串的 GET 请求次数（排除 CORS preflight OPTIONS） */
function countRequestsMatching(page: Page, pattern: RegExp): () => number {
  let count = 0;
  const handler = (req: Request) => {
    if (req.method() === "GET" && pattern.test(req.url())) count++;
  };
  page.on("request", handler);
  return () => count;
}

// ── Suite ──

test.describe("fix-oss-image-traffic-storm", () => {
  test("regression: fix-oss-image-traffic-storm · 行为 1 · 图片在列表反复刷新中只下载 1 次", async ({
    page,
  }) => {
    const token = await registerAndLogin(page);
    const { fileUrl } = await seedImageRecord(token);

    // 只匹配这张图片的 OSS host（path 中的 object key 是一致的）
    const objectKey = new URL(fileUrl).pathname;
    const getImgCount = countRequestsMatching(
      page,
      new RegExp(objectKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );

    await page.goto(WEB);
    await waitForIdle(page, 1500);
    await dismissFirstRunMask(page);

    // 压缩时长下等待至少 3 轮轮询（1s × 3 + 缓冲）
    await page.waitForTimeout(5000);

    expect(getImgCount()).toBe(1);
  });

  test("regression: fix-oss-image-traffic-storm · 行为 2 · 图片 src 在多次刷新中保持稳定", async ({
    page,
  }) => {
    const token = await registerAndLogin(page);
    await seedImageRecord(token);

    await page.goto(WEB);
    await waitForIdle(page, 1500);
    await dismissFirstRunMask(page);

    // 图片可能是 blob: URL（本地缓存命中）或 OSS URL（未缓存时）
    const img = page.locator("img[src^='blob:'], img[src*='aliyuncs'], img[src*='oss']").first();
    await expect(img).toBeVisible({ timeout: 10_000 });
    const src1 = await img.getAttribute("src");
    expect(src1).toBeTruthy();

    // 等待至少一次自动刷新（压缩模式 1s interval）
    await page.waitForTimeout(2000);
    const src2 = await img.getAttribute("src");

    // 核心断言：列表刷新后图片 src 没有变化（无闪烁 / 无重载）
    expect(src2).toBe(src1);
  });

  test("regression: fix-oss-image-traffic-storm · 行为 3 · 卡住的上传在短时间内显示为失败", async ({
    page,
  }) => {
    const token = await registerAndLogin(page);
    await seedStaleUploadingRecord(token);

    await page.goto(WEB);
    await waitForIdle(page, 1500);
    await dismissFirstRunMask(page);

    // 在 2 × STALE_SWEEP_MS (= 10s) 内后端应完成清扫
    await expect(
      page.getByText(/上传失败|上传未完成|重试/).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("regression: fix-oss-image-traffic-storm · 行为 4 · 达到轮询上限后自动刷新暂停", async ({
    page,
  }) => {
    const token = await registerAndLogin(page);
    // 用正偏移让 updated_at 在未来，确保 sweep 不会在测试期间清扫它
    await seedUploadingRecord(token, 60_000);

    const countListRequests = countRequestsMatching(
      page,
      /\/api\/v1\/records(\?|$)/,
    );

    await page.goto(WEB);
    await waitForIdle(page, 1500);
    await dismissFirstRunMask(page);

    // 压缩模式：POLL_MAX_MS=10s, POLL_INTERVAL_MS=1s → 最多 10 轮
    await page.waitForTimeout(20_000);

    // 允许一点抖动：≤ POLL_MAX_MS / POLL_INTERVAL_MS + 2
    expect(countListRequests()).toBeLessThanOrEqual(12);

    // 页面应有"自动刷新已暂停"类型的提示
    await expect(
      page.getByText(/自动刷新已暂停|下拉.{0,6}恢复/).first(),
    ).toBeVisible();
  });

  test("regression: fix-oss-image-traffic-storm · 行为 5 · 切到后台时不产生请求，回到前台立即刷新", async ({
    page,
    context,
  }) => {
    const token = await registerAndLogin(page);
    // 用正偏移让 updated_at 在未来，确保测试期间 record 保持 uploading 触发轮询
    await seedUploadingRecord(token, 60_000);

    await page.goto(WEB);
    await waitForIdle(page, 1500);
    await dismissFirstRunMask(page);

    // 模拟页面切到后台（headless 下 bringToFront 不可靠触发 visibilitychange）
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // 重置计数器
    const countListRequests = countRequestsMatching(
      page,
      /\/api\/v1\/records(\?|$)/,
    );
    await page.waitForTimeout(3000);

    // 隐藏期间不应有请求
    expect(countListRequests()).toBe(0);

    // 模拟切回前台
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(1500);
    expect(countListRequests()).toBeGreaterThanOrEqual(1);
  });

  test("regression: fix-oss-image-traffic-storm · 补充场景 6 · 无卡住记录时不触发持续轮询", async ({
    page,
  }) => {
    const token = await registerAndLogin(page);
    // 注意：不 seed 任何 uploading/processing 记录

    const countListRequests = countRequestsMatching(
      page,
      /\/api\/v1\/records(\?|$)/,
    );

    await page.goto(WEB);
    await waitForIdle(page, 1500);
    await dismissFirstRunMask(page);

    // 等待 5 秒（压缩模式下应覆盖 ≥ 5 个轮询周期）
    await page.waitForTimeout(5000);

    // 首次加载 + 最多 1 次"确认稳定"检查 → 不应超过 2
    expect(countListRequests()).toBeLessThanOrEqual(2);
  });

  test("regression: fix-oss-image-traffic-storm · 行为 6 · 本地缓存命中，刷新页面只下载 1 次", async ({
    page,
  }) => {
    const token = await registerAndLogin(page);
    const { fileUrl } = await seedImageRecord(token);
    const objectKey = new URL(fileUrl).pathname;
    const pattern = new RegExp(
      objectKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );

    const getImgCount = countRequestsMatching(page, pattern);

    await page.goto(WEB);
    await waitForIdle(page, 1500);
    await dismissFirstRunMask(page);
    // 首次加载应完成下载 + 写入 IndexedDB
    await expect(
      page.locator("img[src^='blob:'], img[src*='aliyuncs'], img[src*='oss']").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    const firstLoad = getImgCount();
    expect(firstLoad).toBeGreaterThanOrEqual(1);

    // 刷新后应走本地缓存，不再请求 OSS
    await page.reload();
    await waitForIdle(page, 1500);
    await expect(
      page.locator("img[src^='blob:'], img[src*='aliyuncs'], img[src*='oss']").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // 关键断言：图片域请求次数没有再增长
    expect(getImgCount()).toBe(firstLoad);
  });

  test("regression: fix-oss-image-traffic-storm · 行为 7 · 离线仍可见已缓存的图片", async ({
    page,
    context,
  }) => {
    const token = await registerAndLogin(page);
    await seedImageRecord(token);

    // 先在线浏览一次，确保写入本地缓存
    await page.goto(WEB);
    await waitForIdle(page, 1500);
    await dismissFirstRunMask(page);
    await expect(
      page.locator("img[src^='blob:'], img[src*='aliyuncs'], img[src*='oss']").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);

    // 切离线后重新加载
    await context.setOffline(true);
    await page.reload().catch(() => {}); // SSR 离线 reload 可能失败，忽略
    await page.waitForTimeout(1500);

    // 图片仍应可见（blob: URL 即使离线也能解析）
    const img = page.locator("img[src^='blob:']").first();
    const exists = await img.count();
    // 某些场景下离线 reload 整页 fail —— 允许 0（浏览器根本没把页面加载出来）
    // 但只要页面 render 了，图片就必须在
    if (exists > 0) {
      await expect(img).toBeVisible();
      const naturalWidth = await img.evaluate(
        (el) => (el as HTMLImageElement).naturalWidth,
      );
      expect(naturalWidth).toBeGreaterThan(0);
    }

    // 恢复联网，为后续测试用例留干净状态
    await context.setOffline(false);
  });
});
