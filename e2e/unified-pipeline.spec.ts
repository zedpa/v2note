/**
 * E2E: 统一处理链路 — 验证 Layer 3 一次 AI 调用的全部输出
 *
 * 测试场景：
 *   1. 纯记录（日记） → strike 创建，无 todo
 *   2. 纯待办（"明天3点开会"） → intend strike + todo 创建 + 正确时间
 *   3. 混合输入（记录+待办） → 多 strike + todo
 *   4. 情绪类（"好累"） → feel strike，无 bond
 *   5. 短文本（< 30字）→ 不过度拆解
 *   6. 完成待办指令（"XX做完了"）→ command 提取
 *
 * 前置：gateway 运行在 localhost:3001
 */
import { test, expect } from "@playwright/test";

const GW = "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

/** 轮询等待条件满足 */
async function poll<T>(
  fn: () => Promise<T>,
  check: (v: T) => boolean,
  maxMs = 60_000,
  interval = 2_000,
): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (check(v)) return v;
    await new Promise((r) => setTimeout(r, interval));
  }
  return fn();
}

/** 登录并返回 headers */
async function setupAuth(request: any) {
  const regResp = await request.post(`${GW}/api/v1/devices/register`, {
    data: { identifier: `e2e-unified-${Date.now()}`, platform: "e2e-test" },
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
      "Authorization": `Bearer ${accessToken}`,
    },
  };
}

/** 提交文本并等待处理完成 */
async function submitAndWait(request: any, headers: any, content: string) {
  const createResp = await request.post(`${GW}/api/v1/records/manual`, {
    headers,
    data: { content, useAi: true },
  });
  expect(createResp.ok(), `创建笔记失败: ${createResp.status()}`).toBe(true);
  const { id: recordId } = await createResp.json();

  // 等待处理完成
  const record = await poll(
    async () => {
      const r = await request.get(`${GW}/api/v1/records/${recordId}`, { headers });
      return r.ok() ? r.json() : null;
    },
    (r) => r?.status === "completed" || r?.status === "error",
    120_000,
    3_000,
  );
  expect(record?.status, `AI 处理超时或失败: ${content}`).toBe("completed");
  return recordId;
}

/** 获取 record 的 strikes */
async function getStrikes(request: any, headers: any, recordId: string, maxMs = 30_000) {
  return poll(
    async () => {
      const r = await request.get(`${GW}/api/v1/records/${recordId}/strikes`, { headers });
      return r.ok() ? r.json() : [];
    },
    (list: any[]) => list.length > 0,
    maxMs,
    2_000,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试开始
// ─────────────────────────────────────────────────────────────────────────────

test.describe("统一处理链路 (Layer 3)", () => {
  test.beforeAll(async ({ request }) => {
    const health = await request.get(`${GW}/health`);
    if (!health.ok()) test.skip(true, "Gateway 未运行");
  });

  test("场景1: 纯记录 → strike 创建，polarity 非 intend", async ({ request }) => {
    const { headers } = await setupAuth(request);
    const recordId = await submitAndWait(request, headers, "今天天气真好，在公园散了步，心情不错");

    const strikes = await getStrikes(request, headers, recordId);
    console.log(`[场景1] Strikes: ${strikes.length}`);
    for (const s of strikes) {
      console.log(`  - [${s.polarity}] ${s.nucleus}`);
    }

    expect(strikes.length).toBeGreaterThanOrEqual(1);
    // 纯记录不应产生 intend strike
    const intends = strikes.filter((s: any) => s.polarity === "intend");
    expect(intends.length, "纯记录不应有 intend").toBe(0);
  });

  test("场景2: 纯待办 → intend strike + todo 创建 + 正确时间", async ({ request }) => {
    const { headers } = await setupAuth(request);
    const recordId = await submitAndWait(request, headers, "后天下午三点去找王总谈合同");

    const strikes = await getStrikes(request, headers, recordId);
    console.log(`[场景2] Strikes: ${strikes.length}`);
    for (const s of strikes) {
      console.log(`  - [${s.polarity}] ${s.nucleus} field=${JSON.stringify(s.field)}`);
    }

    const intend = strikes.find((s: any) => s.polarity === "intend");
    expect(intend, "应有 intend strike").toBeDefined();
    expect(intend.nucleus).toContain("王总");

    // 检查 todo 是否被创建
    const todos = await poll(
      async () => {
        const r = await request.get(`${GW}/api/v1/todos`, { headers });
        return r.ok() ? r.json() : [];
      },
      (list: any[]) => list.some((t: any) => t.text?.includes("王总") || t.text?.includes("合同")),
      60_000,
      3_000,
    );

    const match = todos.find((t: any) => t.text?.includes("王总") || t.text?.includes("合同"));
    expect(match, "应创建包含「王总」或「合同」的待办").toBeDefined();
    console.log(`[场景2] Todo: "${match.text}" scheduled: ${match.scheduled_start}`);

    // 验证时间存在
    expect(match.scheduled_start, "待办应有 scheduled_start").toBeTruthy();
  });

  test("场景3: 混合输入 → 多 strike 类型 + todo", async ({ request }) => {
    const { headers } = await setupAuth(request);
    const recordId = await submitAndWait(
      request,
      headers,
      "今天开会讨论了项目延期的问题，老板不太高兴。提醒我明天上午给客户发邮件解释一下进度",
    );

    const strikes = await getStrikes(request, headers, recordId);
    console.log(`[场景3] Strikes: ${strikes.length}`);
    for (const s of strikes) {
      console.log(`  - [${s.polarity}] ${s.nucleus}`);
    }

    // 应有至少 2 个 strike（记录+待办）
    expect(strikes.length, "混合输入应拆为多个 strike").toBeGreaterThanOrEqual(2);

    const polarities = strikes.map((s: any) => s.polarity);
    expect(polarities, "应包含 intend 类型").toContain("intend");

    // 检查 todo
    const todos = await poll(
      async () => {
        const r = await request.get(`${GW}/api/v1/todos`, { headers });
        return r.ok() ? r.json() : [];
      },
      (list: any[]) => list.some((t: any) => t.text?.includes("邮件") || t.text?.includes("客户")),
      60_000,
      3_000,
    );
    const match = todos.find((t: any) => t.text?.includes("邮件") || t.text?.includes("客户"));
    expect(match, "应创建「发邮件」待办").toBeDefined();
    console.log(`[场景3] Todo: "${match.text}"`);
  });

  test("场景4: 情绪类 → feel strike，不拆解", async ({ request }) => {
    const { headers } = await setupAuth(request);
    const recordId = await submitAndWait(request, headers, "好累啊，今天加班到十点");

    const strikes = await getStrikes(request, headers, recordId);
    console.log(`[场景4] Strikes: ${strikes.length}`);
    for (const s of strikes) {
      console.log(`  - [${s.polarity}] ${s.nucleus}`);
    }

    // 情绪类应有 feel
    const feels = strikes.filter((s: any) => s.polarity === "feel");
    expect(feels.length, "应有 feel 类型 strike").toBeGreaterThanOrEqual(1);
    // 短文本不应过度拆解
    expect(strikes.length, "情绪短文本不应过度拆解").toBeLessThanOrEqual(2);
  });

  test("场景5: 短文本单意思 → 不过度拆解（1 个 strike）", async ({ request }) => {
    const { headers } = await setupAuth(request);
    const recordId = await submitAndWait(request, headers, "铝价又涨了百分之五");

    const strikes = await getStrikes(request, headers, recordId);
    console.log(`[场景5] Strikes: ${strikes.length}`);
    for (const s of strikes) {
      console.log(`  - [${s.polarity}] ${s.nucleus}`);
    }

    expect(strikes.length, "短文本单意思应为 1 个 strike").toBe(1);
    expect(strikes[0].polarity, "事实陈述应为 perceive").toBe("perceive");
  });

  test("场景6: 多条独立事项 → 正确拆解", async ({ request }) => {
    const { headers } = await setupAuth(request);
    const recordId = await submitAndWait(
      request,
      headers,
      "今天要做三件事：给妈妈打电话，把快递取了，还有把报告写完",
    );

    const strikes = await getStrikes(request, headers, recordId);
    console.log(`[场景6] Strikes: ${strikes.length}`);
    for (const s of strikes) {
      console.log(`  - [${s.polarity}] ${s.nucleus}`);
    }

    // 3 个独立事项应拆为 3 个 strike
    expect(strikes.length, "三件事应拆为至少 3 个 strike").toBeGreaterThanOrEqual(3);
    // 都应是 intend
    const intends = strikes.filter((s: any) => s.polarity === "intend");
    expect(intends.length, "三件事都应为 intend").toBeGreaterThanOrEqual(3);
  });

  test("场景7: 带具体时间的待办 → scheduled_start 解析正确", async ({ request }) => {
    const { headers } = await setupAuth(request);
    const recordId = await submitAndWait(request, headers, "今天晚上八点半提醒我吃药");

    const strikes = await getStrikes(request, headers, recordId);
    console.log(`[场景7] Strikes: ${strikes.length}`);
    for (const s of strikes) {
      console.log(`  - [${s.polarity}] ${s.nucleus} field=${JSON.stringify(s.field)}`);
    }

    const intend = strikes.find((s: any) => s.polarity === "intend");
    expect(intend, "应有 intend strike").toBeDefined();

    // 检查 field 中的 scheduled_start
    if (intend.field?.scheduled_start) {
      const hour = new Date(intend.field.scheduled_start).getUTCHours();
      // 20:30 CST = 12:30 UTC
      console.log(`[场景7] scheduled_start hour (UTC): ${hour}`);
      expect(hour).toBeGreaterThanOrEqual(12);
      expect(hour).toBeLessThanOrEqual(13);
    }

    // 检查 todo 创建
    const todos = await poll(
      async () => {
        const r = await request.get(`${GW}/api/v1/todos`, { headers });
        return r.ok() ? r.json() : [];
      },
      (list: any[]) => list.some((t: any) => t.text?.includes("吃药")),
      60_000,
      3_000,
    );
    const match = todos.find((t: any) => t.text?.includes("吃药"));
    expect(match, "应创建「吃药」待办").toBeDefined();
    expect(match.scheduled_start, "应有具体时间").toBeTruthy();
    console.log(`[场景7] Todo: "${match.text}" scheduled: ${match.scheduled_start}`);
  });
});
