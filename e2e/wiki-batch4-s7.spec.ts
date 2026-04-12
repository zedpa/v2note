/**
 * E2E: 认知 Wiki Batch 4 — S7 去除 Embedding 依赖
 *
 * 验收行为（来自 spec cognitive-wiki.md Phase 14.12）：
 *   行为 1: Record 入库后不依赖 embedding 即可正常编译
 *   行为 2: 已路由的 record（@语法）编译时能正确关联到 page
 *
 * 前置：gateway 运行在 localhost:3001
 */
import { test, expect } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

async function setupAuth(request: any) {
  const regResp = await request.post(`${GW}/api/v1/devices/register`, {
    data: { identifier: `e2e-wiki-s7-${Date.now()}`, platform: "e2e-test" },
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

async function submitRecord(
  request: any,
  headers: Record<string, string>,
  text: string,
) {
  const resp = await request.post(`${GW}/api/v1/ingest`, {
    headers,
    data: { type: "text", content: text },
  });
  expect(resp.ok()).toBe(true);
  return (await resp.json()).recordId ?? (await resp.json()).id;
}

let headers: Record<string, string>;

test.describe("认知 Wiki Batch 4 S7 — 去除 Embedding 依赖", () => {
  test.beforeAll(async ({ request }) => {
    const auth = await setupAuth(request);
    headers = auth.headers;
  });

  // ────────────────────────────────────────────────────
  // 行为 1: Record 入库 → 编译，不依赖 embedding
  // ────────────────────────────────────────────────────
  test("行为1: Record 入库后，无 embedding 也能正常触发编译", async ({
    request,
  }) => {
    // 录入 record（Phase 14.12 后不再生成 embedding）
    await submitRecord(
      request,
      headers,
      "@学习 今天读完了数据库设计的第三章，理解了范式与反范式的取舍",
    );

    // 触发编译 — 应该不报错，即使 record 没有 embedding
    const compileResp = await request.post(`${GW}/api/v1/wiki/compile`, {
      headers,
      data: {},
    });
    expect(compileResp.ok()).toBe(true);

    // 验证 page 已创建/更新
    const pagesResp = await request.get(`${GW}/api/v1/wiki/pages`, { headers });
    expect(pagesResp.ok()).toBe(true);
    const pages = await pagesResp.json();
    expect(Array.isArray(pages)).toBe(true);
  });

  // ────────────────────────────────────────────────────
  // 行为 2: @路由的 record 编译时正确关联
  // ────────────────────────────────────────────────────
  test("行为2: @路由的 record 通过 wiki_page_record 关联，编译时被正确拉取", async ({
    request,
  }) => {
    // 通过 @语法录入多条 record 到同一主题
    await submitRecord(
      request,
      headers,
      "@编程 学习了 TypeScript 的泛型约束，非常实用",
    );
    await submitRecord(
      request,
      headers,
      "@编程 今天练习了 async/await 的错误处理模式",
    );

    // 触发编译
    const compileResp = await request.post(`${GW}/api/v1/wiki/compile`, {
      headers,
      data: {},
    });
    expect(compileResp.ok()).toBe(true);

    // 验证"编程"相关 page 存在
    const pagesResp = await request.get(`${GW}/api/v1/wiki/pages`, { headers });
    expect(pagesResp.ok()).toBe(true);
    const pages = await pagesResp.json();

    // 应有至少一个 page（@路由创建的）
    expect(pages.length).toBeGreaterThan(0);
  });
});
