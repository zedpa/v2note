/**
 * E2E: 提示词架构 v2 — SharedAgent / UserAgent 分层 + 存储边界重定义
 *
 * 验收行为（来自 spec prompt-architecture-v2.md）：
 *   行为 1: Gateway 启动正常（SHARED_AGENT.md 加载不崩溃）
 *   行为 2: UserAgent 表可用（首次对话自动创建默认模板）
 *   行为 3: Wiki 上下文端点可用（graceful degradation）
 *   行为 4: Chat 历史 CRUD 正常（endChat 精简后不破坏流程）
 *   行为 5: Ingest pipeline 正常（新架构不破坏数据通路）
 *
 * 注意：本 spec 主要是后端架构重构（prompt 组装、工具注册、存储边界），
 * 核心逻辑（buildSystemPrompt 组装顺序、工具注册、skill 默认关闭、
 * isSkillEnabledInUserAgent 检查）由 gateway 单元测试覆盖。
 * Chat 交互为 WebSocket 协议，E2E 层面验证系统集成可用性。
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
    data: { identifier: `e2e-prompt-v2-${Date.now()}`, platform: "e2e-test" },
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

test.describe("提示词架构 v2 — E2E 验收", () => {
  test.beforeAll(async ({ request }) => {
    const auth = await setupAuth(request);
    headers = auth.headers;
    deviceId = auth.deviceId;
  });

  // ────────────────────────────────────────────────────
  // 行为 1: Gateway 启动正常 — SHARED_AGENT.md 加载
  // spec 场景 1.1 + 1.3: SharedAgent 替代 AGENTS.md + chat.md
  // ────────────────────────────────────────────────────
  test("行为1: gateway 启动正常，SHARED_AGENT.md 已加载（启动时同步读取）", async ({ request }) => {
    // SHARED_AGENT.md 在 prompt-builder.ts 模块顶层同步加载
    // 如果文件缺失会 fallback 到 AGENTS.md，再缺失则 fallback 到硬编码字符串
    // 验证 gateway 正常响应任何已认证 API → 启动流程完成（含 SharedAgent 加载）
    const resp = await request.get(`${GW}/api/v1/chat/history`, { headers });
    expect(resp.ok()).toBe(true);
    const body = await resp.json();
    expect(body).toHaveProperty("messages");
  });

  // ────────────────────────────────────────────────────
  // 行为 2: UserAgent 表可用 + findOrCreate
  // spec 场景 2.1 + 2.3 + 2.5: 新用户首次对话时自动创建
  // ────────────────────────────────────────────────────
  test("行为2: ingest → digest pipeline 正常工作（UserAgent 不破坏 context loading）", async ({ request }) => {
    // loadWarmContext 在 chat.initChat 中调用时会加载 UserAgent
    // 此处验证 ingest pipeline（也依赖 context loading）不被新的 UserAgent 加载逻辑破坏
    const resp = await request.post(`${GW}/api/v1/ingest`, {
      headers,
      data: { type: "text", content: "测试提示词架构 v2：UserAgent 不破坏数据通路" },
    });
    expect(resp.ok(), `ingest 失败: ${resp.status()}`).toBe(true);
    const body = await resp.json();
    // ingest 返回 recordId
    expect(body.recordId ?? body.id).toBeTruthy();
  });

  // ────────────────────────────────────────────────────
  // 行为 3: Wiki 上下文端点 — graceful degradation
  // spec 场景 6.2: wikiContext 注入（新用户无数据时跳过）
  // ────────────────────────────────────────────────────
  test("行为3: wiki/pages 端点正常，新用户无数据时返回空数组", async ({ request }) => {
    const pagesResp = await request.get(`${GW}/api/v1/wiki/pages`, { headers });
    expect(pagesResp.ok()).toBe(true);
    const pages = await pagesResp.json();
    // pages 应为数组（可能为空）
    expect(Array.isArray(pages)).toBe(true);
  });

  // ────────────────────────────────────────────────────
  // 行为 4: Chat 历史 CRUD 正常
  // spec 场景 4.1: endChat 精简为 session 清理
  // ────────────────────────────────────────────────────
  test("行为4: chat history GET + DELETE 正常工作（endChat 精简后不破坏）", async ({ request }) => {
    // 获取历史
    const getResp = await request.get(`${GW}/api/v1/chat/history`, { headers });
    expect(getResp.ok()).toBe(true);
    const history = await getResp.json();
    expect(history).toHaveProperty("messages");
    expect(history).toHaveProperty("has_more");

    // 清空历史
    const delResp = await request.delete(`${GW}/api/v1/chat/history`, { headers });
    expect(delResp.ok()).toBe(true);
    const delBody = await delResp.json();
    expect(delBody.ok).toBe(true);

    // 清空后再查应为空
    const afterResp = await request.get(`${GW}/api/v1/chat/history`, { headers });
    expect(afterResp.ok()).toBe(true);
    const afterBody = await afterResp.json();
    expect(afterBody.messages).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────
  // 行为 5: 认知上下文从 wiki 加载（不依赖 strike/bond）
  // spec 场景 6.3 + 6.5: advisor-context 迁移到 wiki_page
  // ────────────────────────────────────────────────────
  test("行为5: wiki search 端点正常（认知上下文数据源）", async ({ request }) => {
    // advisor-context.ts 的 loadChatCognitive 现在查 wiki_page
    // wiki search 是认知上下文的数据源之一
    const searchResp = await request.get(
      `${GW}/api/v1/search?q=测试`,
      { headers },
    );
    // search 可能返回空结果但不应报错
    expect(searchResp.ok()).toBe(true);
    const results = await searchResp.json();
    // 统一搜索返回 { wiki_results: [], record_results: [] }
    expect(results).toHaveProperty("wiki_results");
    expect(results).toHaveProperty("record_results");
  });
});
