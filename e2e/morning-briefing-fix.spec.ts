/**
 * E2E 验收测试：早报时区错位 + 问候语风格
 *
 * 验收行为 1: 早报推送返回当日新鲜内容（非昨日缓存）
 * 验收行为 2: 问候语体现用户画像，非待办驱动
 *
 * 前置条件：
 *   1. cd gateway && pnpm dev（后端 localhost:3001）
 *   2. TZ=Asia/Shanghai（服务器时区）
 *
 * 运行：npx playwright test e2e/morning-briefing-fix.spec.ts --reporter=list
 */
import { test, expect } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";

// ── 辅助函数 ──

async function gw(method: string, path: string, body?: any, headers?: Record<string, string>) {
  if (method === "GET" && body && !headers && typeof body === "object" && body["X-Device-Id"]) {
    headers = body;
    body = undefined;
  }
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

/** 注册设备并返回 deviceId */
async function registerDevice(): Promise<string> {
  const id = `e2e-briefing-${Date.now()}`;
  const { status, data } = await gw("POST", "/api/v1/devices/register", {
    identifier: id,
    platform: "web",
  });
  expect(status).toBe(200);
  expect(data.id).toBeTruthy();
  return data.id;
}

// ── 验收行为 1: 早报返回当日新鲜内容 ──

test.describe("regression: fix-morning-briefing — 早报日期正确性", () => {
  test("GET /api/v1/daily/briefing 返回包含今日日期的 greeting", async () => {
    const deviceId = await registerDevice();

    // 请求晨间简报（forceRefresh 确保新生成）
    const { status, data: briefing } = await gw(
      "GET",
      "/api/v1/daily/briefing?refresh=true",
      { "X-Device-Id": deviceId },
    );
    expect(status).toBe(200);

    // greeting 必须存在且非空
    expect(briefing.greeting).toBeTruthy();
    expect(typeof briefing.greeting).toBe("string");

    // greeting 中应包含今天的日期信息（月/日）
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const containsTodayDate =
      briefing.greeting.includes(`${month}月`) ||
      briefing.greeting.includes(`${day}日`);
    expect(containsTodayDate).toBe(true);
  });

  test("连续两次请求不应返回跨天的缓存", async () => {
    const deviceId = await registerDevice();
    const headers = { "X-Device-Id": deviceId };

    // 第一次：强制刷新生成
    const { status: s1, data: briefing1 } = await gw(
      "GET",
      "/api/v1/daily/briefing?refresh=true",
      headers,
    );
    expect(s1).toBe(200);

    // 第二次：使用缓存
    const { status: s2, data: briefing2 } = await gw(
      "GET",
      "/api/v1/daily/briefing",
      headers,
    );
    expect(s2).toBe(200);

    // 两次 greeting 应该一致（同一天缓存命中）
    expect(briefing2.greeting).toBe(briefing1.greeting);

    // 结构完整性
    expect(briefing2).toHaveProperty("today_focus");
    expect(briefing2).toHaveProperty("stats");
  });
});

// ── 验收行为 2: 问候语体现用户画像 ──

test.describe("regression: fix-morning-briefing — 问候语风格", () => {
  test("greeting 长度在合理范围内（≤30 中文字符）", async () => {
    const deviceId = await registerDevice();

    const { status, data: briefing } = await gw(
      "GET",
      "/api/v1/daily/briefing?refresh=true",
      { "X-Device-Id": deviceId },
    );
    expect(status).toBe(200);

    // greeting 长度应 ≤30 字符
    expect(briefing.greeting.length).toBeLessThanOrEqual(30);
    // greeting 至少应有一定长度
    expect(briefing.greeting.length).toBeGreaterThanOrEqual(5);
  });

  test("greeting 不应以待办数量为主题", async () => {
    const deviceId = await registerDevice();

    const { status, data: briefing } = await gw(
      "GET",
      "/api/v1/daily/briefing?refresh=true",
      { "X-Device-Id": deviceId },
    );
    expect(status).toBe(200);

    // greeting 不应包含"N件事""N个待办"等待办数量描述
    expect(briefing.greeting).not.toMatch(/\d+\s*件事/);
    expect(briefing.greeting).not.toMatch(/\d+\s*个待办/);
    expect(briefing.greeting).not.toMatch(/\d+\s*条待办/);
  });
});
