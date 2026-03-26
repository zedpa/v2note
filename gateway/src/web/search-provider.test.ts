/**
 * agent-web-tools spec 测试
 * web_search + fetch_url + 安全边界
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("../db/pool.js", () => ({
  query: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn().mockResolvedValue(null),
  execute: vi.fn(),
}));

// =====================================================================
// 搜索服务抽象
// =====================================================================
describe("搜索服务选型", () => {
  it("should_return_null_when_no_api_key_configured", async () => {
    const { createSearchProvider } = await import("./search-provider.js");
    // 默认没有 env 变量
    const provider = createSearchProvider();
    // 无 key 时返回 null
    expect(provider).toBeNull();
  });
});

// =====================================================================
// URL 安全边界
// =====================================================================
describe("URL 安全边界", () => {
  it("should_reject_localhost_urls", async () => {
    const { isUrlSafe } = await import("./url-safety.js");
    expect(isUrlSafe("http://localhost:3000")).toBe(false);
    expect(isUrlSafe("http://127.0.0.1")).toBe(false);
    expect(isUrlSafe("http://192.168.1.1")).toBe(false);
    expect(isUrlSafe("http://10.0.0.1/api")).toBe(false);
  });

  it("should_allow_public_https_urls", async () => {
    const { isUrlSafe } = await import("./url-safety.js");
    expect(isUrlSafe("https://example.com")).toBe(true);
    expect(isUrlSafe("https://metal.com/aluminum")).toBe(true);
  });

  it("should_reject_non_http_protocols", async () => {
    const { isUrlSafe } = await import("./url-safety.js");
    expect(isUrlSafe("ftp://files.example.com")).toBe(false);
    expect(isUrlSafe("file:///etc/passwd")).toBe(false);
  });
});

// =====================================================================
// web_search 工具定义
// =====================================================================
describe("web_search 工具", () => {
  it("should_have_silent_autonomy", async () => {
    const { webSearchToolDef } = await import("./web-search-tool.js");
    expect(webSearchToolDef.autonomy).toBe("silent");
  });

  it("should_return_error_when_no_provider", async () => {
    const { webSearchToolDef } = await import("./web-search-tool.js");
    const result = await webSearchToolDef.handler(
      { query: "test", max_results: 5 },
      { deviceId: "dev-1", sessionId: "s-1" },
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("未启用");
  });
});

// =====================================================================
// fetch_url 工具定义
// =====================================================================
describe("fetch_url 工具", () => {
  it("should_have_silent_autonomy", async () => {
    const { fetchUrlToolDef } = await import("./fetch-url-tool.js");
    expect(fetchUrlToolDef.autonomy).toBe("silent");
  });

  it("should_reject_unsafe_urls", async () => {
    const { fetchUrlToolDef } = await import("./fetch-url-tool.js");
    const result = await fetchUrlToolDef.handler(
      { url: "http://localhost:3000" },
      { deviceId: "dev-1", sessionId: "s-1" },
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("不允许");
  });
});
