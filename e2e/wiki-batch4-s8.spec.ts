/**
 * E2E: 认知 Wiki Batch 4 — S8 现有数据迁移
 *
 * 验收行为（来自 spec cognitive-wiki.md Phase 15.1）：
 *   行为 1: 迁移后所有 page 有 page_type 和 created_by 字段
 *   行为 2: 迁移后 page 列表 API 正常返回
 *   行为 3: domain 与 L3 page title 对齐
 *
 * 前置：gateway 运行在 localhost:3001，迁移已执行
 */
import { test, expect } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

async function setupAuth(request: any) {
  const regResp = await request.post(`${GW}/api/v1/devices/register`, {
    data: { identifier: `e2e-wiki-s8-${Date.now()}`, platform: "e2e-test" },
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

test.describe("认知 Wiki Batch 4 S8 — 现有数据迁移", () => {
  test.beforeAll(async ({ request }) => {
    const auth = await setupAuth(request);
    headers = auth.headers;
  });

  // ────────────────────────────────────────────────────
  // 行为 1: 迁移后 page 有正确的字段
  // ────────────────────────────────────────────────────
  test("行为1: 所有 page 都有 page_type 和 created_by 字段", async ({
    request,
  }) => {
    const pagesResp = await request.get(`${GW}/api/v1/wiki/pages`, { headers });
    expect(pagesResp.ok()).toBe(true);
    const pages = await pagesResp.json();

    for (const page of pages) {
      expect(page.page_type).toBeTruthy();
      expect(["topic", "goal"]).toContain(page.page_type);
      expect(page.created_by).toBeTruthy();
      expect(["ai", "user"]).toContain(page.created_by);
    }
  });

  // ────────────────────────────────────────────────────
  // 行为 2: page 列表 API 正常工作
  // ────────────────────────────────────────────────────
  test("行为2: GET /wiki/pages 正常返回，含新字段", async ({
    request,
  }) => {
    const pagesResp = await request.get(`${GW}/api/v1/wiki/pages`, { headers });
    expect(pagesResp.ok()).toBe(true);
    const pages = await pagesResp.json();
    expect(Array.isArray(pages)).toBe(true);

    // 每个 page 应有 token_count 字段
    for (const page of pages) {
      expect(typeof page.token_count).toBe("number");
    }
  });

  // ────────────────────────────────────────────────────
  // 行为 3: L3 page 的 domain 与 title 一致
  // ────────────────────────────────────────────────────
  test("行为3: L3 page 的 domain 字段与 title 对齐", async ({
    request,
  }) => {
    const pagesResp = await request.get(`${GW}/api/v1/wiki/pages`, { headers });
    expect(pagesResp.ok()).toBe(true);
    const pages = await pagesResp.json();

    const l3Pages = pages.filter((p: any) => p.level === 3);
    for (const page of l3Pages) {
      // L3 page 的 domain 应该等于自己的 title
      if (page.domain && page.title) {
        expect(page.domain).toBe(page.title);
      }
    }
  });
});
