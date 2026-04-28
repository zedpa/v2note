/**
 * provider.ts 多 Provider 支持单元测试
 *
 * 覆盖场景：
 * - 2.1: Provider 注册表初始化
 * - 2.2: 未配置的 Provider 静默跳过
 * - 2.3: Provider 调用失败自动降级
 * - 2.4: 推理模型检测扩展
 * - 边界: 所有 provider key 都未配置
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 在 import provider 模块之前 mock 依赖
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn((opts: any) => {
    // 返回一个 mock provider，带 name 标识
    const mockProvider = {
      _name: opts.name ?? "unknown",
      _apiKey: opts.apiKey,
      _baseURL: opts.baseURL,
      chat: vi.fn((model: string) => ({ modelId: model, provider: opts.name })),
    };
    return mockProvider;
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("../lib/semaphore.js", () => ({
  Semaphore: class {
    acquire(fn: any, _opts?: any) { return fn(); }
  },
  Priority: { HIGH: 1, NORMAL: 0 },
}));

// ── 动态导入辅助 ──
// provider.ts 使用模块级状态（_provider, _tiers 等），
// 每个测试需要重新加载模块以重置状态
async function loadProviderModule() {
  // 清除模块缓存以重置 _provider 等全局状态
  vi.resetModules();
  // 重新 mock
  vi.doMock("@ai-sdk/openai", () => ({
    createOpenAI: vi.fn((opts: any) => {
      const mockProvider = {
        _name: opts.name ?? "unknown",
        _apiKey: opts.apiKey,
        _baseURL: opts.baseURL,
        chat: vi.fn((model: string) => ({ modelId: model, provider: opts.name })),
      };
      return mockProvider;
    }),
  }));
  vi.doMock("ai", () => ({
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateObject: vi.fn(),
  }));
  vi.doMock("../lib/semaphore.js", () => ({
    Semaphore: class {
      acquire(fn: any, _opts?: any) { return fn(); }
    },
    Priority: { HIGH: 1, NORMAL: 0 },
  }));

  return await import("./provider.js");
}

describe("provider -- 多 Provider 支持", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 最小化环境变量
    process.env.DASHSCOPE_API_KEY = "test-dashscope-key";
    process.env.AI_BASE_URL = "https://dashscope.test/v1";
    process.env.AI_MODEL = "qwen-plus";
    process.env.AI_TIMEOUT = "5000";
    // 清理其他 provider 的环境变量
    delete process.env.GLM_API_KEY;
    delete process.env.GLM_BASE_URL;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.AI_PROVIDER_CHAT;
    delete process.env.AI_PROVIDER_AGENT;
    delete process.env.AI_PROVIDER_FAST;
    delete process.env.AI_PROVIDER_REPORT;
    delete process.env.AI_PROVIDER_BACKGROUND;
    delete process.env.AI_PROVIDER_VISION;
    delete process.env.AI_MODEL_CHAT;
    delete process.env.AI_MODEL_FAST;
    delete process.env.AI_MODEL_AGENT;
    delete process.env.AI_MODEL_REPORT;
    delete process.env.AI_MODEL_BACKGROUND;
    delete process.env.AI_MODEL_VISION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ── 场景 2.1: Provider 注册表初始化 ──

  describe("场景 2.1: Provider 注册表初始化", () => {
    it("should_register_glm_provider_when_GLM_API_KEY_configured", async () => {
      process.env.GLM_API_KEY = "test-glm-key";
      process.env.GLM_BASE_URL = "https://glm.test/v4";
      process.env.AI_PROVIDER_CHAT = "glm";

      const mod = await loadProviderModule();
      const { provider, config } = mod.getTier("chat");

      // chat 层应绑定到 GLM provider
      expect((provider as any)._name).toBe("glm");
      expect((provider as any)._apiKey).toBe("test-glm-key");
    });

    it("should_log_provider_registry_on_startup", async () => {
      process.env.GLM_API_KEY = "test-glm-key";
      process.env.GLM_BASE_URL = "https://glm.test/v4";

      const consoleSpy = vi.spyOn(console, "log");
      const mod = await loadProviderModule();
      mod.getTier("fast"); // 触发 ensureProvider

      // 检查日志包含 provider 注册表信息
      const logCalls = consoleSpy.mock.calls.map(c => c.join(" "));
      const hasRegistry = logCalls.some(msg => msg.includes("provider") || msg.includes("Provider"));
      expect(hasRegistry).toBe(true);

      consoleSpy.mockRestore();
    });

    it("should_keep_dashscope_as_default_provider", async () => {
      const mod = await loadProviderModule();
      const { provider } = mod.getTier("fast");
      expect((provider as any)._name).toBe("dashscope");
    });
  });

  // ── 场景 2.2: 未配置的 Provider 静默跳过 ──

  describe("场景 2.2: 未配置的 Provider 静默跳过", () => {
    it("should_only_register_dashscope_when_no_other_keys_configured", async () => {
      // GLM_API_KEY 和 DEEPSEEK_API_KEY 未设置
      const consoleSpy = vi.spyOn(console, "log");
      const warnSpy = vi.spyOn(console, "warn");

      const mod = await loadProviderModule();
      mod.getTier("fast"); // 触发初始化

      // 所有 tier 都应使用 dashscope
      const { provider: chatProvider } = mod.getTier("chat");
      expect((chatProvider as any)._name).toBe("dashscope");

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("should_fallback_tier_to_dashscope_when_specified_provider_has_no_key", async () => {
      // 配置 chat 使用 glm，但没有 GLM_API_KEY
      process.env.AI_PROVIDER_CHAT = "glm";

      const warnSpy = vi.spyOn(console, "warn");
      const mod = await loadProviderModule();
      const { provider } = mod.getTier("chat");

      // 应回退到 dashscope
      expect((provider as any)._name).toBe("dashscope");
      warnSpy.mockRestore();
    });
  });

  // ── 场景 2.4: 推理模型检测扩展 ──

  describe("场景 2.4: 推理模型检测扩展", () => {
    it("should_detect_qwen3_as_reasoning_model", async () => {
      const mod = await loadProviderModule();
      expect(mod.isReasoningModel("qwen3.5-plus")).toBe(true);
      expect(mod.isReasoningModel("qwen3-max")).toBe(true);
    });

    it("should_detect_deepseek_reasoner_as_reasoning_model", async () => {
      const mod = await loadProviderModule();
      expect(mod.isReasoningModel("deepseek-reasoner")).toBe(true);
    });

    it("should_not_detect_glm_as_reasoning_model", async () => {
      const mod = await loadProviderModule();
      expect(mod.isReasoningModel("glm-4-plus")).toBe(false);
      expect(mod.isReasoningModel("glm-4")).toBe(false);
    });

    it("should_not_detect_regular_deepseek_as_reasoning_model", async () => {
      const mod = await loadProviderModule();
      expect(mod.isReasoningModel("deepseek-chat")).toBe(false);
      expect(mod.isReasoningModel("deepseek-v3")).toBe(false);
    });

    it("should_not_detect_qwen_plus_as_reasoning_model", async () => {
      const mod = await loadProviderModule();
      expect(mod.isReasoningModel("qwen-plus")).toBe(false);
    });
  });

  // ── 场景 2.3: Provider 调用失败自动降级 ──

  describe("场景 2.3: Provider 调用失败自动降级", () => {
    it("should_fallback_to_dashscope_when_non_default_provider_fails", async () => {
      process.env.GLM_API_KEY = "test-glm-key";
      process.env.GLM_BASE_URL = "https://glm.test/v4";
      process.env.AI_PROVIDER_CHAT = "glm";
      process.env.AI_MODEL_CHAT = "glm-4-plus";

      const mod = await loadProviderModule();

      // 获取 mock 的 generateText
      const { generateText: mockGenerateText } = await import("ai");

      let callCount = 0;
      (mockGenerateText as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // 第一次调用（GLM）失败
          throw new Error("GLM API timeout");
        }
        // 第二次调用（dashscope 降级）成功
        return {
          text: "fallback response",
          usage: { inputTokens: 10, outputTokens: 5 },
        };
      });

      const result = await mod.chatCompletion(
        [{ role: "user", content: "hello" }],
        { tier: "chat" },
      );

      expect(callCount).toBe(2);
      expect(result.content).toBe("fallback response");
    });

    it("should_not_fallback_when_default_provider_fails", async () => {
      // 默认 dashscope 失败时不再降级（无处可降）
      const mod = await loadProviderModule();

      const { generateText: mockGenerateText } = await import("ai");
      (mockGenerateText as any).mockRejectedValue(new Error("DashScope API error"));

      await expect(
        mod.chatCompletion(
          [{ role: "user", content: "hello" }],
          { tier: "fast" },
        ),
      ).rejects.toThrow("DashScope API error");
    });

    it("should_log_fallback_event_when_degrading", async () => {
      process.env.GLM_API_KEY = "test-glm-key";
      process.env.GLM_BASE_URL = "https://glm.test/v4";
      process.env.AI_PROVIDER_CHAT = "glm";
      process.env.AI_MODEL_CHAT = "glm-4-plus";

      const mod = await loadProviderModule();
      const warnSpy = vi.spyOn(console, "warn");

      const { generateText: mockGenerateText } = await import("ai");
      let callCount = 0;
      (mockGenerateText as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("GLM timeout");
        return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 } };
      });

      await mod.chatCompletion(
        [{ role: "user", content: "test" }],
        { tier: "chat" },
      );

      // 应有降级日志
      const warnCalls = warnSpy.mock.calls.map(c => c.join(" "));
      const hasFallbackLog = warnCalls.some(msg =>
        msg.includes("fallback") || msg.includes("降级"),
      );
      expect(hasFallbackLog).toBe(true);

      warnSpy.mockRestore();
    });
  });

  // ── 边界条件 ──

  describe("边界条件", () => {
    it("should_work_with_only_dashscope_when_all_provider_keys_missing", async () => {
      // 只有 DASHSCOPE_API_KEY
      const mod = await loadProviderModule();
      const { provider } = mod.getTier("fast");
      expect((provider as any)._name).toBe("dashscope");
      expect((provider as any)._apiKey).toBe("test-dashscope-key");
    });

    it("should_register_deepseek_provider_when_configured", async () => {
      process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
      process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.test/v1";
      process.env.AI_PROVIDER_AGENT = "deepseek";

      const mod = await loadProviderModule();
      const { provider } = mod.getTier("agent");
      expect((provider as any)._name).toBe("deepseek");
    });
  });
});
