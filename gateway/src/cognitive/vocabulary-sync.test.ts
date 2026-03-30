/**
 * vocabulary-sync 测试
 *
 * 验证 DashScope VocabularyService 同步逻辑：
 * - 词汇是用户维度，跨设备共享同一份 DashScope 词表
 * - 首次同步 → create_vocabulary，存储 vocabulary_id 到 app_user
 * - 后续同步 → update_vocabulary
 * - 频率→权重映射正确
 * - 超过 500 词时截断
 * - DashScope 失败时降级（不阻断 ASR）
 * - 未登录设备（无 user_id）跳过同步
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 数据库 ──
const mockQuery = vi.fn();
const mockExecute = vi.fn();
vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  execute: (...args: any[]) => mockExecute(...args),
  queryOne: vi.fn(),
}));

// ── Mock 词汇 repo（按用户查询） ──
const mockFindByUser = vi.fn();
vi.mock("../db/repositories/vocabulary.js", () => ({
  findByDevice: vi.fn(),
  findByUser: (...args: any[]) => mockFindByUser(...args),
}));

// ── Mock fetch ──
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { syncVocabularyToDashScope } from "./vocabulary-sync.js";

function makeEntry(term: string, freq: number) {
  return {
    id: crypto.randomUUID(),
    device_id: "dev-1",
    user_id: "user-1",
    term,
    aliases: [],
    domain: "tech",
    frequency: freq,
    source: "user" as const,
    created_at: new Date().toISOString(),
  };
}

function mockFetchSuccess(vocabularyId: string) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ output: { vocabulary_id: vocabularyId } }),
  });
}

describe("syncVocabularyToDashScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHSCOPE_API_KEY = "test-key";

    // 默认：device 关联到 user-1，user-1 无 vocabulary_id
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM device") && sql.includes("user_id")) {
        return [{ user_id: "user-1" }];
      }
      if (sql.includes("FROM app_user") && sql.includes("asr_vocabulary_id")) {
        return [{ asr_vocabulary_id: null }];
      }
      return [];
    });
    mockExecute.mockResolvedValue(1);
  });

  it("should_create_vocabulary_when_no_vocabulary_id_exists", async () => {
    mockFindByUser.mockResolvedValue([
      makeEntry("Kubernetes", 5),
      makeEntry("Docker", 3),
    ]);
    mockFetchSuccess("vocab-new-123");

    const result = await syncVocabularyToDashScope("dev-1");

    expect(result).toBe("vocab-new-123");

    // 应调用 create_vocabulary
    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.input.action).toBe("create_vocabulary");
    expect(body.input.vocabulary).toHaveLength(2);

    // 应将 vocabulary_id 存入 app_user 表（用户维度，非设备维度）
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("app_user"),
      expect.arrayContaining(["vocab-new-123", "user-1"]),
    );
  });

  it("should_update_vocabulary_when_vocabulary_id_exists", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM device")) return [{ user_id: "user-1" }];
      if (sql.includes("FROM app_user")) return [{ asr_vocabulary_id: "vocab-existing-456" }];
      return [];
    });
    mockFindByUser.mockResolvedValue([makeEntry("OKR", 8)]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ output: {} }),
    });

    const result = await syncVocabularyToDashScope("dev-1");

    expect(result).toBe("vocab-existing-456");
    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.input.action).toBe("update_vocabulary");
    expect(body.input.vocabulary_id).toBe("vocab-existing-456");
  });

  it("should_share_vocabulary_id_across_devices_of_same_user", async () => {
    // 两台设备，同一个 user-1，已有 vocabulary_id
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM device")) return [{ user_id: "user-1" }];
      if (sql.includes("FROM app_user")) return [{ asr_vocabulary_id: "vocab-shared-789" }];
      return [];
    });
    mockFindByUser.mockResolvedValue([makeEntry("Sprint", 4)]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    // dev-2 触发同步，使用的是 user-1 的 vocabulary_id
    const resultDevA = await syncVocabularyToDashScope("dev-2");
    expect(resultDevA).toBe("vocab-shared-789");

    const [, opts] = mockFetch.mock.calls[0];
    expect(JSON.parse(opts.body).input.action).toBe("update_vocabulary");
    // 不应创建新 vocabulary_id
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("should_skip_sync_when_device_has_no_user_id", async () => {
    // 未登录设备
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM device")) return [{ user_id: null }];
      return [];
    });
    mockFindByUser.mockResolvedValue([makeEntry("术语", 3)]);

    const result = await syncVocabularyToDashScope("dev-guest");
    expect(result).toBe("");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should_map_frequency_to_weight_correctly", async () => {
    mockFindByUser.mockResolvedValue([
      makeEntry("词A", 0),   // weight 2
      makeEntry("词B", 1),   // weight 3
      makeEntry("词C", 5),   // weight 4
      makeEntry("词D", 10),  // weight 5
    ]);
    mockFetchSuccess("vocab-w");

    await syncVocabularyToDashScope("dev-1");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const vocab: Array<{ text: string; weight: number }> = body.input.vocabulary;
    expect(vocab.find((v) => v.text === "词A")?.weight).toBe(2);
    expect(vocab.find((v) => v.text === "词B")?.weight).toBe(3);
    expect(vocab.find((v) => v.text === "词C")?.weight).toBe(4);
    expect(vocab.find((v) => v.text === "词D")?.weight).toBe(5);
  });

  it("should_truncate_to_500_words_by_frequency", async () => {
    const entries = Array.from({ length: 600 }, (_, i) =>
      makeEntry(`词${i}`, 600 - i),
    );
    mockFindByUser.mockResolvedValue(entries);
    mockFetchSuccess("vocab-trunc");

    await syncVocabularyToDashScope("dev-1");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input.vocabulary).toHaveLength(500);
    expect(body.input.vocabulary[0].text).toBe("词0");
  });

  it("should_return_empty_string_and_not_throw_when_dashscope_fails", async () => {
    mockFindByUser.mockResolvedValue([makeEntry("术语", 3)]);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await syncVocabularyToDashScope("dev-1");
    expect(result).toBe("");
  });

  it("should_return_empty_string_when_vocabulary_is_empty", async () => {
    mockFindByUser.mockResolvedValue([]);

    const result = await syncVocabularyToDashScope("dev-1");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toBe("");
  });
});
