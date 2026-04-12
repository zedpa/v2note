/**
 * E2E: 认知 Wiki Batch 4 — S9 前端文件夹模式 + Suggestion UI
 *
 * 验收行为（来自 spec cognitive-wiki.md Phase 15.2 / 15.3）：
 *   行为 1: wiki/sidebar API 返回 page_type 字段（goal 可被前端识别）
 *   行为 2: GET /wiki/suggestions 返回建议列表
 *   行为 3: POST accept/reject suggestion 正常工作
 *
 * 前置：gateway 运行在 localhost:3001
 */
import { test, expect } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

async function setupAuth(request: any) {
  const regResp = await request.post(`${GW}/api/v1/devices/register`, {
    data: { identifier: `e2e-wiki-s9-${Date.now()}`, platform: "e2e-test" },
  });
  expect(regResp.ok()).toBe(true);
  const { id: deviceId } = await regResp.json();

  const loginResp = await request.post(`${GW}/api/v1/auth/login`, {
    data: { phone: TEST_PHONE, password: TEST_PASSWORD, deviceId },
  });
  expect(loginResp.ok(), "登录失败").toBe(true);
  const { accessToken } = await loginResp.json();

  return {
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": deviceId,
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

let headers: Record<string, string>;

test.describe("认知 Wiki Batch 4 S9 — 前端文件夹模式 + Suggestion UI", () => {
  test.beforeAll(async ({ request }) => {
    const auth = await setupAuth(request);
    headers = auth.headers;
  });

  // ────────────────────────────────────────────────────
  // 行为 1: sidebar API 返回 page_type
  // ────────────────────────────────────────────────────
  test("行为1: GET /wiki/sidebar 返回的 page 包含 pageType 字段", async ({
    request,
  }) => {
    const resp = await request.get(`${GW}/api/v1/wiki/sidebar`, { headers });
    expect(resp.ok()).toBe(true);
    const data = await resp.json();
    expect(data).toHaveProperty("pages");
    expect(Array.isArray(data.pages)).toBe(true);

    // 每个 page 应有 pageType 字段
    for (const page of data.pages) {
      expect(page).toHaveProperty("pageType");
      expect(["topic", "goal"]).toContain(page.pageType);
    }
  });

  // ────────────────────────────────────────────────────
  // 行为 2: 建议列表 API
  // ────────────────────────────────────────────────────
  test("行为2: GET /wiki/suggestions 返回建议数组", async ({
    request,
  }) => {
    const resp = await request.get(`${GW}/api/v1/wiki/suggestions`, { headers });
    expect(resp.ok()).toBe(true);
    const suggestions = await resp.json();
    expect(Array.isArray(suggestions)).toBe(true);
  });

  // ────────────────────────────────────────────────────
  // 行为 3: 建议接受/拒绝 API
  // ────────────────────────────────────────────────────
  test("行为3: 不存在的 suggestion accept/reject 返回 404", async ({
    request,
  }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const acceptResp = await request.post(
      `${GW}/api/v1/wiki/suggestions/${fakeId}/accept`,
      { headers },
    );
    // 不存在的 suggestion 应返回 404
    expect(acceptResp.status()).toBe(404);

    const rejectResp = await request.post(
      `${GW}/api/v1/wiki/suggestions/${fakeId}/reject`,
      { headers },
    );
    expect(rejectResp.status()).toBe(404);
  });
});
