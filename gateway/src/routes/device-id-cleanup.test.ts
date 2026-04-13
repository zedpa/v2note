/**
 * 验证 deviceId 清理：所有路由文件（除 devices.ts）不再导入 getDeviceId
 * regression: fix-device-id-cleanup
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = __dirname; // gateway/src/routes/
const MCP_SERVER = join(__dirname, "../mcp/server.ts");

// 需要检查的路由文件（排除 devices.ts 和测试文件）
const routeFiles = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "devices.ts");

describe("fix-device-id-cleanup: 路由层 deviceId 清理", () => {
  it.each(routeFiles)(
    "should_not_import_getDeviceId_when_route_file_is_%s",
    (filename) => {
      const content = readFileSync(join(ROUTES_DIR, filename), "utf-8");
      // 不应该从 http-helpers 导入 getDeviceId
      const importMatch = content.match(/import\s+\{[^}]*getDeviceId[^}]*\}\s+from/);
      expect(importMatch).toBeNull();
    },
  );

  it.each(routeFiles)(
    "should_not_call_getDeviceId_when_route_file_is_%s",
    (filename) => {
      const content = readFileSync(join(ROUTES_DIR, filename), "utf-8");
      // 不应该调用 getDeviceId(req)
      expect(content).not.toContain("getDeviceId(req)");
      expect(content).not.toContain("getDeviceId(_req)");
    },
  );

  it("should_not_import_getDeviceId_when_mcp_server", () => {
    const content = readFileSync(MCP_SERVER, "utf-8");
    const importMatch = content.match(/import\s+\{[^}]*getDeviceId[^}]*\}\s+from/);
    expect(importMatch).toBeNull();
  });

  it("should_not_call_getDeviceId_when_mcp_server", () => {
    const content = readFileSync(MCP_SERVER, "utf-8");
    expect(content).not.toContain("getDeviceId(req)");
  });

  it("should_mark_getDeviceId_as_deprecated_in_http_helpers", () => {
    const content = readFileSync(
      join(__dirname, "../lib/http-helpers.ts"),
      "utf-8",
    );
    // 在 getDeviceId 函数定义前应有 @deprecated 注释
    const idx = content.indexOf("export function getDeviceId");
    expect(idx).toBeGreaterThan(-1);
    const before = content.slice(Math.max(0, idx - 300), idx);
    expect(before).toContain("@deprecated");
  });

  it("should_mark_todo_findByDevice_as_deprecated", () => {
    const content = readFileSync(
      join(__dirname, "../db/repositories/todo.ts"),
      "utf-8",
    );
    const idx = content.indexOf("export async function findByDevice");
    expect(idx).toBeGreaterThan(-1);
    const before = content.slice(Math.max(0, idx - 200), idx);
    expect(before).toContain("@deprecated");
  });

  it("should_mark_memory_findByDevice_as_deprecated", () => {
    const content = readFileSync(
      join(__dirname, "../db/repositories/memory.ts"),
      "utf-8",
    );
    const idx = content.indexOf("export async function findByDevice");
    expect(idx).toBeGreaterThan(-1);
    const before = content.slice(Math.max(0, idx - 200), idx);
    expect(before).toContain("@deprecated");
  });

  // devices.ts 应该保留 getDeviceId
  it("should_preserve_getDeviceId_in_devices_ts", () => {
    const content = readFileSync(join(ROUTES_DIR, "devices.ts"), "utf-8");
    expect(content).toContain("getDeviceId");
  });
});
