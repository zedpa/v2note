/**
 * E2E: 早晚报接入 v2 提示词架构 + 内容质量提升
 *
 * 验收行为（来自 spec fix-briefing-prompt-v2.md）：
 *   E2E-1: 晨间简报包含目标脉搏（goal_pulse）
 *   E2E-2: 晚间回顾包含日记洞察（insight）和每日肯定（affirmation）
 *   E2E-3: 早晚报人格一致（非公文腔）
 *
 * 前置：gateway 运行在 localhost:3001
 */
import { test, expect } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

// ── Helpers ──────────────────────────────────────────

/** 注册设备 + 登录，返回 headers */
async function setupAuth(request: any) {
  const regResp = await request.post(`${GW}/api/v1/devices/register`, {
    data: { identifier: `e2e-briefing-v2-${Date.now()}`, platform: "e2e-test" },
  });
  expect(regResp.ok()).toBe(true);
  const { id: deviceId } = await regResp.json();

  const loginResp = await request.post(`${GW}/api/v1/auth/login`, {
    data: { phone: TEST_PHONE, password: TEST_PASSWORD, deviceId },
  });
  expect(loginResp.ok(), "登录失败").toBe(true);
  const { accessToken } = await loginResp.json();

  return {
    deviceId,
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": deviceId,
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

// ── Test State ───────────────────────────────────────
let headers: Record<string, string>;
let deviceId: string;

test.describe("早晚报 v2 — E2E 验收", () => {
  test.beforeAll(async ({ request }) => {
    const auth = await setupAuth(request);
    headers = auth.headers;
    deviceId = auth.deviceId;
  });

  // ────────────────────────────────────────────────────
  // E2E-1: 晨间简报包含目标脉搏
  // ────────────────────────────────────────────────────
  test("E2E-1: 晨间简报返回 goal_pulse 字段", async ({ request }) => {
    // 先创建一个目标（通过 ingest 或直接 API）
    const goalResp = await request.post(`${GW}/api/v1/goals`, {
      headers,
      data: { title: "E2E测试目标-提升供应链效率", status: "active" },
    });
    // 目标创建可能有不同的 API 路径，忽略失败继续测试
    if (goalResp.ok()) {
      // 创建一个关联待办
      await request.post(`${GW}/api/v1/ingest`, {
        headers,
        data: { type: "text", content: "帮我拆解一下提升供应链效率的行动步骤" },
      });
    }

    // 请求晨间简报（forceRefresh）
    const briefingResp = await request.get(
      `${GW}/api/v1/daily/briefing?refresh=true`,
      { headers },
    );
    expect(briefingResp.ok(), `晨间简报请求失败: ${briefingResp.status()}`).toBe(true);
    const briefing = await briefingResp.json();

    // 验证基本字段存在
    expect(briefing).toHaveProperty("greeting");
    expect(briefing).toHaveProperty("today_focus");
    expect(briefing).toHaveProperty("stats");

    // 验证新增 goal_pulse 字段存在（可能为空数组但字段必须存在）
    expect(briefing).toHaveProperty("goal_pulse");
    expect(Array.isArray(briefing.goal_pulse)).toBe(true);

    // 验证 greeting 不是公文腔
    const greeting: string = briefing.greeting;
    expect(greeting.length).toBeGreaterThan(0);
    expect(greeting.length).toBeLessThanOrEqual(50); // ≤30字 + 一些宽容
    // 不应包含"尊敬的""您好"等公文开头
    expect(greeting).not.toMatch(/尊敬的|亲爱的用户/);
  });

  // ────────────────────────────────────────────────────
  // E2E-2: 晚间回顾包含日记洞察和每日肯定
  // ────────────────────────────────────────────────────
  test("E2E-2: 晚间回顾返回 insight 和 affirmation 字段", async ({ request }) => {
    // 先提交一条日记作为洞察素材
    const ingestResp = await request.post(`${GW}/api/v1/ingest`, {
      headers,
      data: { type: "text", content: "今天和张总讨论了铝价上涨对供应链的影响，决定下周调整采购策略。晚上跑了5公里，膝盖还是有点不舒服。" },
    });
    expect(ingestResp.ok()).toBe(true);

    // 请求晚间回顾（forceRefresh）
    const summaryResp = await request.get(
      `${GW}/api/v1/daily/evening-summary?refresh=true`,
      { headers },
    );
    expect(summaryResp.ok(), `晚间回顾请求失败: ${summaryResp.status()}`).toBe(true);
    const summary = await summaryResp.json();

    // 验证基本字段存在
    expect(summary).toHaveProperty("headline");
    expect(summary).toHaveProperty("accomplishments");
    expect(summary).toHaveProperty("stats");

    // 验证新增字段存在
    expect(summary).toHaveProperty("insight");
    expect(typeof summary.insight).toBe("string");

    expect(summary).toHaveProperty("affirmation");
    expect(typeof summary.affirmation).toBe("string");

    // headline 不应是公文腔
    const headline: string = summary.headline;
    expect(headline).not.toMatch(/无事项完成|亦无待办遗留/);
  });

  // ────────────────────────────────────────────────────
  // E2E-3: 早晚报人格一致（非公文腔）
  // ────────────────────────────────────────────────────
  test("E2E-3: 早报和晚报的语气非公文腔", async ({ request }) => {
    // 获取早报
    const briefingResp = await request.get(
      `${GW}/api/v1/daily/briefing?refresh=true`,
      { headers },
    );
    expect(briefingResp.ok()).toBe(true);
    const briefing = await briefingResp.json();

    // 获取晚报
    const summaryResp = await request.get(
      `${GW}/api/v1/daily/evening-summary?refresh=true`,
      { headers },
    );
    expect(summaryResp.ok()).toBe(true);
    const summary = await summaryResp.json();

    // 公文腔黑名单
    const bureaucratic = /尊敬的|亲爱的用户|特此通知|综上所述|如有疑问/;

    expect(briefing.greeting).not.toMatch(bureaucratic);
    expect(summary.headline).not.toMatch(bureaucratic);
  });
});
