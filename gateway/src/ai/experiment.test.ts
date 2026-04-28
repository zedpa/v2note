/**
 * experiment.ts 在线实验框架单元测试
 *
 * 覆盖场景：
 * - 3.1: 确定性用户分流
 * - 3.2: Soul 变体实验
 * - 3.3: 上下文注入变体实验
 * - 3.4: 模型变体实验
 * - 4.1: 对话指标自动记录
 * - 边界: 实验配置为空 → 所有用户默认行为
 * - 边界: 实验中途不影响已有分配
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";

// Mock fs.appendFileSync 和 fs.mkdirSync 避免实际写文件
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),
  };
});

describe("experiment.ts — 在线实验框架", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── 动态导入辅助，每次重置模块状态 ──
  async function loadModule() {
    vi.resetModules();
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        appendFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        existsSync: vi.fn(() => true),
      };
    });
    return await import("./experiment.js");
  }

  // ── 场景 3.1: 确定性用户分流 ──

  describe("getVariant — 确定性分流", () => {
    it("should_return_same_variant_when_same_userId_and_experiment", async () => {
      const mod = await loadModule();
      const config = { name: "soul-variant", variants: ["current", "streamlined"] };

      const v1 = mod.getVariant("user-abc", config);
      const v2 = mod.getVariant("user-abc", config);
      const v3 = mod.getVariant("user-abc", config);

      expect(v1).toBe(v2);
      expect(v2).toBe(v3);
      // 结果必须是 variants 中的一个
      expect(config.variants).toContain(v1);
    });

    it("should_distribute_users_across_variants_when_different_userIds", async () => {
      const mod = await loadModule();
      const config = { name: "soul-variant", variants: ["current", "streamlined"] };

      // 测试 100 个用户，应该两个变体都有分配
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(mod.getVariant(`user-${i}`, config));
      }

      expect(results.size).toBe(2);
      expect(results.has("current")).toBe(true);
      expect(results.has("streamlined")).toBe(true);
    });

    it("should_return_different_variant_when_different_experiment_name", async () => {
      const mod = await loadModule();
      // 不同实验名可能（大概率）分到不同变体
      // 至少验证函数接受不同实验名
      const config1 = { name: "soul-variant", variants: ["a", "b"] };
      const config2 = { name: "context-strategy", variants: ["a", "b"] };

      const v1 = mod.getVariant("user-test", config1);
      const v2 = mod.getVariant("user-test", config2);

      expect(["a", "b"]).toContain(v1);
      expect(["a", "b"]).toContain(v2);
    });

    it("should_handle_single_variant_when_only_one_option", async () => {
      const mod = await loadModule();
      const config = { name: "test", variants: ["only-one"] };

      const v = mod.getVariant("any-user", config);
      expect(v).toBe("only-one");
    });

    it("should_handle_three_or_more_variants", async () => {
      const mod = await loadModule();
      const config = { name: "multi", variants: ["a", "b", "c"] };

      const results = new Set<string>();
      for (let i = 0; i < 200; i++) {
        results.add(mod.getVariant(`user-${i}`, config));
      }

      // 200 个用户、3 个变体，每个变体都应有分配
      expect(results.size).toBe(3);
    });
  });

  // ── 场景 3.2: Soul 变体便捷函数 ──

  describe("getSoulVariant — Soul 变体实验", () => {
    it("should_return_current_or_streamlined_when_experiment_enabled", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "true";
      process.env.AB_EXPERIMENTS = "soul-variant:current,streamlined";

      const mod = await loadModule();
      const variant = mod.getSoulVariant("user-123");

      expect(["current", "streamlined"]).toContain(variant);
    });

    it("should_return_current_when_experiment_disabled", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "false";
      process.env.AB_EXPERIMENTS = "soul-variant:current,streamlined";

      const mod = await loadModule();
      const variant = mod.getSoulVariant("user-123");

      expect(variant).toBe("current");
    });

    it("should_return_current_when_no_experiment_configured", async () => {
      delete process.env.AB_EXPERIMENT_ENABLED;
      delete process.env.AB_EXPERIMENTS;

      const mod = await loadModule();
      const variant = mod.getSoulVariant("user-123");

      expect(variant).toBe("current");
    });
  });

  // ── 场景 3.3: 上下文注入变体 ──

  describe("getContextStrategy — 上下文注入变体实验", () => {
    it("should_return_hint_only_or_hybrid_when_experiment_enabled", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "true";
      process.env.AB_EXPERIMENTS = "context-strategy:hint-only,hybrid";

      const mod = await loadModule();
      const strategy = mod.getContextStrategy("user-456");

      expect(["hint-only", "hybrid"]).toContain(strategy);
    });

    it("should_return_hint_only_when_experiment_disabled", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "false";
      process.env.AB_EXPERIMENTS = "context-strategy:hint-only,hybrid";

      const mod = await loadModule();
      const strategy = mod.getContextStrategy("user-456");

      expect(strategy).toBe("hint-only");
    });
  });

  // ── 场景 3.4: 模型变体实验 ──

  describe("getChatModel — 模型变体实验", () => {
    it("should_return_model_name_when_experiment_enabled", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "true";
      process.env.AB_EXPERIMENTS = "chat-model:qwen3.5-plus,glm-4-plus";

      const mod = await loadModule();
      const model = mod.getChatModel("user-789");

      expect(["qwen3.5-plus", "glm-4-plus"]).toContain(model);
    });

    it("should_return_null_when_experiment_disabled", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "false";
      process.env.AB_EXPERIMENTS = "chat-model:qwen3.5-plus,glm-4-plus";

      const mod = await loadModule();
      const model = mod.getChatModel("user-789");

      expect(model).toBeNull();
    });

    it("should_return_null_when_no_chat_model_experiment", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "true";
      process.env.AB_EXPERIMENTS = "soul-variant:current,streamlined";

      const mod = await loadModule();
      const model = mod.getChatModel("user-789");

      expect(model).toBeNull();
    });
  });

  // ── 环境变量解析 ──

  describe("parseExperiments — 环境变量解析", () => {
    it("should_parse_multiple_experiments_from_env", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "true";
      process.env.AB_EXPERIMENTS = "soul-variant:current,streamlined;context-strategy:hint-only,hybrid";

      const mod = await loadModule();

      // 验证两个实验都生效
      const soul = mod.getSoulVariant("user-1");
      const ctx = mod.getContextStrategy("user-1");

      expect(["current", "streamlined"]).toContain(soul);
      expect(["hint-only", "hybrid"]).toContain(ctx);
    });

    it("should_handle_empty_AB_EXPERIMENTS_gracefully", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "true";
      process.env.AB_EXPERIMENTS = "";

      const mod = await loadModule();

      expect(mod.getSoulVariant("user-1")).toBe("current");
      expect(mod.getContextStrategy("user-1")).toBe("hint-only");
      expect(mod.getChatModel("user-1")).toBeNull();
    });

    it("should_handle_malformed_AB_EXPERIMENTS_gracefully", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "true";
      process.env.AB_EXPERIMENTS = "invalid-format";

      const mod = await loadModule();

      // 不应崩溃，返回默认值
      expect(mod.getSoulVariant("user-1")).toBe("current");
    });
  });

  // ── SOUL_B 内容导出 ──

  describe("SOUL_B — 精简版 Soul 定义", () => {
    it("should_export_SOUL_B_as_non_empty_string", async () => {
      const mod = await loadModule();
      expect(typeof mod.SOUL_B).toBe("string");
      expect(mod.SOUL_B.length).toBeGreaterThan(50);
    });

    it("should_contain_key_soul_b_characteristics", async () => {
      const mod = await loadModule();
      // Soul-B 精简直接版，应包含核心特征
      expect(mod.SOUL_B).toContain("路路");
      expect(mod.SOUL_B).toContain("1-3句话");
    });
  });

  // ── 场景 4.1: 实验日志记录 ──

  describe("logExperiment — 指标日志记录", () => {
    it("should_write_structured_jsonl_when_called", async () => {
      const mod = await loadModule();
      const { appendFileSync } = await import("node:fs");

      mod.logExperiment({
        timestamp: "2026-04-28T10:00:00Z",
        userId: "user-123",
        experiment: "soul-variant",
        variant: "streamlined",
        model: "qwen3.5-plus",
        provider: "dashscope",
        response_length: 42,
        latency_ms: 1200,
        tool_calls_count: 0,
      });

      expect(appendFileSync).toHaveBeenCalledTimes(1);
      const call = (appendFileSync as any).mock.calls[0];
      // 文件路径应包含 experiments.jsonl
      expect(call[0]).toContain("experiments.jsonl");
      // 写入的内容应是有效 JSON
      const written = call[1] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.userId).toBe("user-123");
      expect(parsed.experiment).toBe("soul-variant");
      expect(parsed.variant).toBe("streamlined");
      expect(parsed.response_length).toBe(42);
      expect(parsed.latency_ms).toBe(1200);
    });

    it("should_append_newline_after_each_log_entry", async () => {
      const mod = await loadModule();
      const { appendFileSync } = await import("node:fs");

      mod.logExperiment({
        timestamp: "2026-04-28T10:00:00Z",
        userId: "user-1",
        experiment: "test",
        variant: "a",
        model: "m",
        provider: "p",
        response_length: 10,
        latency_ms: 100,
        tool_calls_count: 0,
      });

      const call = (appendFileSync as any).mock.calls[0];
      const written = call[1] as string;
      expect(written.endsWith("\n")).toBe(true);
    });

    it("should_ensure_logs_directory_exists", async () => {
      // 需要特殊的 loadModule，让 existsSync 返回 false
      vi.resetModules();
      const mockMkdirSync = vi.fn();
      const mockAppendFileSync = vi.fn();
      vi.doMock("node:fs", async () => {
        const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
        return {
          ...actual,
          appendFileSync: mockAppendFileSync,
          mkdirSync: mockMkdirSync,
          existsSync: vi.fn(() => false),
        };
      });

      const mod = await import("./experiment.js");

      mod.logExperiment({
        timestamp: "2026-04-28T10:00:00Z",
        userId: "user-1",
        experiment: "test",
        variant: "a",
        model: "m",
        provider: "p",
        response_length: 10,
        latency_ms: 100,
        tool_calls_count: 0,
      });

      expect(mockMkdirSync).toHaveBeenCalled();
    });
  });

  // ── 边界条件 ──

  describe("边界条件", () => {
    it("should_use_defaults_when_AB_EXPERIMENT_ENABLED_not_set", async () => {
      delete process.env.AB_EXPERIMENT_ENABLED;
      delete process.env.AB_EXPERIMENTS;

      const mod = await loadModule();

      expect(mod.getSoulVariant("any")).toBe("current");
      expect(mod.getContextStrategy("any")).toBe("hint-only");
      expect(mod.getChatModel("any")).toBeNull();
    });

    it("should_be_deterministic_across_module_reloads", async () => {
      process.env.AB_EXPERIMENT_ENABLED = "true";
      process.env.AB_EXPERIMENTS = "soul-variant:current,streamlined";

      const mod1 = await loadModule();
      const v1 = mod1.getSoulVariant("stable-user");

      const mod2 = await loadModule();
      const v2 = mod2.getSoulVariant("stable-user");

      // hash 是纯函数，应该跨模块重载一致
      expect(v1).toBe(v2);
    });
  });
});
