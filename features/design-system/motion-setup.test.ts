/**
 * design-visual-alignment spec — 场景 1.1
 * 验证 framer-motion 安装和统一导出
 */
import { describe, it, expect } from "vitest";

describe("design-visual-alignment: 场景 1.1 — motion 库安装", () => {
  it("should_import_framer_motion_without_error", async () => {
    const fm = await import("framer-motion");
    expect(fm.motion).toBeDefined();
    expect(fm.AnimatePresence).toBeDefined();
    expect(fm.useSpring).toBeDefined();
  });

  it("should_import_shared_motion_module", async () => {
    const mod = await import("@/shared/lib/motion");
    expect(mod.motion).toBeDefined();
    expect(mod.AnimatePresence).toBeDefined();
  });
});
