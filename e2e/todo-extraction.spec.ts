/**
 * E2E: 待办提取链路 — 真实 Gateway + DB
 *
 * 前置：gateway 运行在 localhost:3001
 * 验证："明天要去上山打老虎" → process → digest → 提取出 intend strike → 投影为 todo
 */
import { test, expect } from "@playwright/test";

const GW = "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

/** 等待条件满足，最多 maxMs 毫秒 */
async function poll<T>(
  fn: () => Promise<T>,
  check: (v: T) => boolean,
  maxMs = 30_000,
  interval = 1_000,
): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (check(v)) return v;
    await new Promise((r) => setTimeout(r, interval));
  }
  return fn();
}

test("「明天要去上山打老虎」应提取出待办并带有明天的时间", async ({ request }) => {
  // ── Step 1: 健康检查 ──────────────────────────────────────────────
  const health = await request.get(`${GW}/health`);
  if (!health.ok()) {
    test.skip(true, "Gateway 未运行，跳过 E2E");
    return;
  }

  // ── Step 2: 注册设备 + 登录获取真实 userId ──────────────────────
  const identifier = `e2e-${Date.now()}`;
  const regResp = await request.post(`${GW}/api/v1/devices/register`, {
    headers: { "Content-Type": "application/json" },
    data: { identifier, platform: "e2e-test" },
  });
  expect(regResp.ok()).toBe(true);
  const { id: deviceId } = await regResp.json();
  console.log(`✓ 设备已注册: ${deviceId}`);

  const loginResp = await request.post(`${GW}/api/v1/auth/login`, {
    headers: { "Content-Type": "application/json" },
    data: { phone: TEST_PHONE, password: TEST_PASSWORD, deviceId },
  });
  expect(loginResp.ok(), "登录失败").toBe(true);
  const { accessToken } = await loginResp.json();
  console.log(`✓ 登录成功`);

  const HEADERS = {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
    "Authorization": `Bearer ${accessToken}`,
  };

  // ── Step 3: 提交文本笔记（触发 processEntry → digest） ───────────
  const createResp = await request.post(`${GW}/api/v1/records/manual`, {
    headers: HEADERS,
    data: {
      content: "明天要去上山打老虎",
      useAi: true,
    },
  });
  expect(createResp.ok(), `创建笔记失败: ${createResp.status()}`).toBe(true);

  const { id: recordId } = await createResp.json();
  console.log(`✓ 笔记已创建: ${recordId}`);

  // ── Step 4: 等待 AI 处理完成（process + digest）──────────────────
  const record = await poll(
    async () => {
      const r = await request.get(`${GW}/api/v1/records/${recordId}`, { headers: HEADERS });
      return r.ok() ? r.json() : null;
    },
    (r) => r?.status === "completed" || r?.status === "error",
    120_000,
    3_000,
  );
  console.log(`✓ Record 状态: ${record?.status}`);
  expect(record?.status, "AI 处理超时或失败").toBe("completed");

  // ── Step 5: 查询待办列表 ─────────────────────────────────────────
  // digest 是异步的，需要额外等待
  const todos = await poll(
    async () => {
      const r = await request.get(`${GW}/api/v1/todos`, { headers: HEADERS });
      return r.ok() ? r.json() : [];
    },
    (list: any[]) => list.some((t: any) =>
      t.text?.includes("打老虎") || t.text?.includes("上山"),
    ),
    60_000,
    3_000,
  );

  console.log(`✓ 待办列表 (共 ${todos.length} 条):`);
  for (const t of todos) {
    console.log(`  - [${t.done ? "✓" : " "}] ${t.text} | scheduled: ${t.scheduled_start ?? "无"}`);
  }

  // ── Step 6: 断言 ─────────────────────────────────────────────────
  const match = todos.find(
    (t: any) => t.text?.includes("打老虎") || t.text?.includes("上山"),
  );
  expect(match, "应从「明天要去上山打老虎」中提取出待办").toBeDefined();
  console.log(`✓ 匹配到待办: "${match.text}"`);

  // 验证时间：应有 scheduled_start 且为明天
  expect(match.scheduled_start, "待办应有 scheduled_start 时间").toBeTruthy();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const todoDate = match.scheduled_start.split("T")[0];
  console.log(`✓ 待办时间: ${todoDate}, 期望明天: ${tomorrowStr}`);
  expect(todoDate, "「明天」应解析为明天的日期").toBe(tomorrowStr);

  // ── Step 7: 查看 strike 是否有 intend 类型（digest 异步，需等待）─
  const strikes = await poll(
    async () => {
      const r = await request.get(`${GW}/api/v1/records/${recordId}/strikes`, { headers: HEADERS });
      return r.ok() ? r.json() : [];
    },
    (list: any[]) => list.some((s: any) => s.polarity === "intend"),
    30_000,
    3_000,
  );
  console.log(`✓ Strikes (共 ${strikes.length} 条):`);
  for (const s of strikes) {
    console.log(`  - [${s.polarity}] ${s.nucleus} (confidence: ${s.confidence})`);
  }
  const intendStrike = strikes.find((s: any) => s.polarity === "intend");
  expect(intendStrike, "应存在 polarity=intend 的 Strike").toBeDefined();
});
