/**
 * E2E: 认知 Wiki Batch 4 — S2 废弃 Digest 的 Goal 提取
 *
 * 验收行为（来自 spec cognitive-wiki.md Phase 14.2）：
 *   行为 1: Digest 只提取 action 级 todo，不再创建 goal
 *   行为 2: 含目标意图的日记，digest 后不产生 goal todo
 *
 * 前置：gateway 运行在 localhost:3001，Phase 14 迁移已执行
 */
import { test, expect } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

// ── Helpers ──────────────────────────────────────────

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

async function setupAuth(request: any) {
  const regResp = await request.post(`${GW}/api/v1/devices/register`, {
    data: { identifier: `e2e-wiki-s2-${Date.now()}`, platform: "e2e-test" },
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

async function submitRecord(
  request: any,
  headers: Record<string, string>,
  text: string,
) {
  const resp = await request.post(`${GW}/api/v1/ingest`, {
    headers,
    data: { type: "text", content: text },
  });
  expect(resp.ok(), `提交日记失败: ${text.slice(0, 30)}...`).toBe(true);
  const body = await resp.json();
  return body.recordId ?? body.id;
}

// ── Tests ────────────────────────────────────────────
let headers: Record<string, string>;

test.describe("认知 Wiki Batch 4 S2 — Digest 不再提取 Goal", () => {
  test.beforeAll(async ({ request }) => {
    const auth = await setupAuth(request);
    headers = auth.headers;
  });

  // ────────────────────────────────────────────────────
  // 行为 1: 含简单待办的日记 → digest 正常提取 action todo
  // ────────────────────────────────────────────────────
  test("行为1: 含简单待办的日记 → digest 仍正常提取 action todo", async ({
    request,
  }) => {
    await submitRecord(request, headers, "明天下午3点和张总开会确认报价");

    const todos = await poll(
      async () => {
        const resp = await request.get(`${GW}/api/v1/todos`, { headers });
        return resp.json();
      },
      (data: any) => {
        const items = Array.isArray(data) ? data : data.items ?? [];
        return items.some(
          (t: any) => t.text?.includes("张总") || t.text?.includes("报价"),
        );
      },
      60_000,
      3_000,
    );

    const items = Array.isArray(todos) ? todos : todos.items ?? [];
    const actionTodo = items.find(
      (t: any) => t.text?.includes("张总") || t.text?.includes("报价"),
    );
    expect(actionTodo, "简单待办应被正常提取").toBeTruthy();
    // action todo 的 level 应为 0
    expect(actionTodo.level ?? 0).toBe(0);
  });

  // ────────────────────────────────────────────────────
  // 行为 2: 含长期目标意图的日记 → digest 不创建 goal
  // ────────────────────────────────────────────────────
  test("行为2: 含目标意图的日记 → digest 不产生 goal 级 todo", async ({
    request,
  }) => {
    // 录入明确包含长期目标意图的日记
    await submitRecord(
      request,
      headers,
      "今年一定要通过英语六级考试，已经报名了，打算每天背100个单词",
    );

    // 等待 digest 完成
    await new Promise((r) => setTimeout(r, 15_000));

    // 检查 todos：应该只有 action 级别（如"背单词"），不应有 goal 级别（如"通过六级"）
    const resp = await request.get(`${GW}/api/v1/todos`, { headers });
    expect(resp.ok()).toBe(true);
    const data = await resp.json();
    const items = Array.isArray(data) ? data : data.items ?? [];

    // 过滤本次相关的 todo
    const relatedTodos = items.filter(
      (t: any) =>
        t.text?.includes("六级") ||
        t.text?.includes("单词") ||
        t.text?.includes("英语"),
    );

    // 不应有 goal 级别的 todo（level >= 1）
    const goalTodos = relatedTodos.filter((t: any) => (t.level ?? 0) >= 1);
    expect(
      goalTodos.length,
      `Digest 不应创建 goal 级 todo，实际: ${goalTodos.map((t: any) => `"${t.text}" (level=${t.level})`).join(", ")}`,
    ).toBe(0);

    // 如果有 action todo 也是合理的（"背100个单词"是具体行动）
    console.log(
      `[行为2] 相关 todo: ${relatedTodos.map((t: any) => `"${t.text}" (level=${t.level ?? 0})`).join(", ") || "无"}`,
    );
  });
});
