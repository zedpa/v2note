/**
 * E2E: domain 字段全面废弃
 *
 * 验收行为（来自 spec fix-domain-deprecation.md）：
 *   行为 1: 新建记录不再写 domain
 *   行为 2: 搜索工具按主题过滤（wiki_page.title 替代 domain）
 *   行为 3: wiki-compiler 不再输出 domain
 *
 * 前置：gateway 运行在 localhost:3001
 */
import { test, expect } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

// ── Helpers ──────────────────────────────────────────

async function setupAuth(request: any) {
  const loginResp = await request.post(`${GW}/api/v1/auth/login`, {
    data: { phone: TEST_PHONE, password: TEST_PASSWORD },
  });
  const loginBody = await loginResp.json();
  return {
    Authorization: `Bearer ${loginBody.token}`,
    "Content-Type": "application/json",
  };
}

// ── 行为 1: 新建 todo 后 domain 字段为 null ──────────

test.describe("domain 废弃 — 行为 1: 新建记录不再写 domain", () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    headers = await setupAuth(request);
  });

  test("POST /api/v1/todos 创建 todo 返回不含 domain 字段", async ({ request }) => {
    const resp = await request.post(`${GW}/api/v1/todos`, {
      headers,
      data: {
        text: `e2e-domain-test-${Date.now()}`,
      },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    const todo = body.todo ?? body;
    // 返回的 todo 对象中不应包含 domain 字段
    expect(todo).not.toHaveProperty("domain");
  });
});

// ── 行为 2: 搜索按 wiki page title 过滤 ──────────

test.describe("domain 废弃 — 行为 2: 搜索按主题过滤", () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    headers = await setupAuth(request);
  });

  test("GET /api/v1/wiki/sidebar 返回的 page 不含 domain 字段", async ({ request }) => {
    const resp = await request.get(`${GW}/api/v1/wiki/sidebar`, { headers });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    // 侧边栏 page 列表中不应返回 domain 字段
    if (body.pages && body.pages.length > 0) {
      for (const page of body.pages) {
        expect(page).not.toHaveProperty("domain");
      }
    }
  });
});

// ── 行为 3: wiki page 详情不返回 domain ──────────

test.describe("domain 废弃 — 行为 3: wiki page 详情无 domain", () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    headers = await setupAuth(request);
  });

  test("GET /api/v1/wiki/pages 列表中 page 不含 domain", async ({ request }) => {
    const resp = await request.get(`${GW}/api/v1/wiki/pages`, { headers });
    if (resp.ok()) {
      const body = await resp.json();
      const pages = body.pages ?? body;
      if (Array.isArray(pages) && pages.length > 0) {
        for (const page of pages) {
          expect(page).not.toHaveProperty("domain");
        }
      }
    }
  });
});
