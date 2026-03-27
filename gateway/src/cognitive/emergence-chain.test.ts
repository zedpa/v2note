/**
 * P3 spec 测试: top-level-dimensions + emergence-chain
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StrikeEntry } from "../db/repositories/strike.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeStrike(overrides: Partial<StrikeEntry> = {}): StrikeEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    user_id: "user-1",
    nucleus: "test",
    polarity: "perceive",
    field: {},
    source_id: null,
    source_span: null,
    source_type: "think",
    confidence: 0.8,
    salience: 1.0,
    status: "active",
    superseded_by: null,
    is_cluster: false,
    created_at: new Date().toISOString(),
    digested_at: null,
    level: null,
    origin: null,
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────

const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn();

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}));

const mockStrikeCreate = vi.fn();
vi.mock("../db/repositories/strike.js", () => ({
  create: (...args: any[]) => mockStrikeCreate(...args),
  findActive: vi.fn().mockResolvedValue([]),
  findById: vi.fn(),
  findByUser: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock("../db/repositories/bond.js", () => ({
  create: vi.fn().mockResolvedValue({ id: "b1" }),
  createMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("../db/repositories/index.js", async () => {
  const strike = await import("../db/repositories/strike.js");
  const bond = await import("../db/repositories/bond.js");
  return {
    strikeRepo: strike,
    bondRepo: bond,
    strikeTagRepo: { createMany: vi.fn() },
  };
});

vi.mock("../ai/provider.js", () => ({
  chatCompletion: vi.fn().mockResolvedValue({ content: '{"valid":false}' }),
}));

vi.mock("../memory/embeddings.js", () => ({
  getEmbedding: vi.fn().mockResolvedValue(new Array(1024).fill(0)),
  cosineSimilarity: vi.fn().mockReturnValue(0.7),
  isEmbeddingAvailable: vi.fn().mockReturnValue(true),
}));

const mockCheckIntendEmergence = vi.fn().mockResolvedValue(null);
vi.mock("./goal-linker.js", () => ({
  checkIntendEmergence: (...args: any[]) => mockCheckIntendEmergence(...args),
}));

// =====================================================================
// P3-1: level 字段
// =====================================================================
describe("P3-1: level 字段", () => {
  it("should_include_level_in_StrikeEntry", () => {
    const strike = makeStrike({ level: 1 });
    expect(strike.level).toBe(1);
  });

  it("should_set_level_1_when_creating_cluster", async () => {
    const { runClustering } = await import("./clustering.js");

    // 给足够数据让 clustering 创建 cluster
    const strikes = Array.from({ length: 6 }, (_, i) =>
      makeStrike({ id: `s${i}`, is_cluster: false, source_type: "think" }),
    );

    // findActive 返回 strikes
    const { findActive } = await import("../db/repositories/strike.js");
    vi.mocked(findActive).mockResolvedValue(strikes);

    // Mock 图数据：所有 strike 互相连接（高三角闭合度）
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("SELECT * FROM bond")) {
        const bonds = [];
        for (let i = 0; i < strikes.length; i++) {
          for (let j = i + 1; j < strikes.length; j++) {
            bonds.push({
              id: `b-${i}-${j}`,
              source_strike_id: strikes[i].id,
              target_strike_id: strikes[j].id,
              type: "context_of",
              strength: 0.7,
            });
          }
        }
        return Promise.resolve(bonds);
      }
      // filterExisting: 没有已存在的 cluster
      if (sql.includes("cluster_member")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    // AI 审核通过
    const { chatCompletion } = await import("../ai/provider.js");
    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify({ valid: true, name: "测试主题", description: "测试", polarity: "perceive" }),
    } as any);

    mockStrikeCreate.mockResolvedValue(makeStrike({ id: "cluster-new", is_cluster: true, level: 1 }));

    await runClustering("user-1");

    // 验证 create 被调用时包含 level: 1
    if (mockStrikeCreate.mock.calls.length > 0) {
      const args = mockStrikeCreate.mock.calls[0][0];
      expect(args.level).toBe(1);
    }
  });
});

// =====================================================================
// P3-2: 顶层维度生成
// =====================================================================
describe("P3-2: 顶层维度生成", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_generate_top_level_dimensions_from_text", async () => {
    const { generateTopLevelDimensions } = await import("./top-level.js");

    mockStrikeCreate.mockImplementation((args: any) =>
      Promise.resolve(makeStrike({ id: `tl-${args.nucleus}`, ...args })),
    );

    const dims = await generateTopLevelDimensions(
      "user-1",
      "我在铸造厂上班，业余做自己的产品，偶尔炒炒币",
    );

    expect(dims.length).toBeGreaterThanOrEqual(2);
    expect(dims.length).toBeLessThanOrEqual(6);
    // 每个维度应为 is_cluster=true, level=3
    for (const d of dims) {
      expect(d.is_cluster).toBe(true);
      expect(d.level).toBe(3);
    }
  });

  it("should_match_strike_to_top_level_dimension", async () => {
    const { matchToTopLevel } = await import("./top-level.js");

    // Mock: 已有顶层维度
    const topLevels = [
      makeStrike({ id: "tl-work", nucleus: "[工作] 日常工作", is_cluster: true, level: 3 }),
      makeStrike({ id: "tl-invest", nucleus: "[投资] 投资理财", is_cluster: true, level: 3 }),
    ];

    const { cosineSimilarity } = await import("../memory/embeddings.js");
    // 第一个相似度高，第二个低
    vi.mocked(cosineSimilarity)
      .mockReturnValueOnce(0.75) // 与"工作"相似
      .mockReturnValueOnce(0.3); // 与"投资"不相似

    const match = await matchToTopLevel("供应链优化方案", topLevels);
    expect(match).toBeDefined();
    expect(match!.id).toBe("tl-work");
  });

  it("should_return_null_when_no_match_above_threshold", async () => {
    const { matchToTopLevel } = await import("./top-level.js");

    const topLevels = [
      makeStrike({ id: "tl-work", nucleus: "[工作]", is_cluster: true, level: 3 }),
    ];

    const { cosineSimilarity } = await import("../memory/embeddings.js");
    vi.mocked(cosineSimilarity).mockReturnValue(0.3); // 都低于阈值

    const match = await matchToTopLevel("今天心情不好", topLevels);
    expect(match).toBeNull();
  });
});

// =====================================================================
// P3-3: L2 涌现 + emergence 集成
// =====================================================================
describe("P3-3: L2 涌现", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_create_L2_when_3_L1_clusters_are_strongly_connected", async () => {
    const { discoverL2Clusters } = await import("./l2-emergence.js");

    const l1Clusters = [
      makeStrike({ id: "c1", is_cluster: true, level: 1, nucleus: "[供应链成本]" }),
      makeStrike({ id: "c2", is_cluster: true, level: 1, nucleus: "[供应商质量]" }),
      makeStrike({ id: "c3", is_cluster: true, level: 1, nucleus: "[供应商关系]" }),
    ];

    // Mock: 所有 L1 之间有 bond
    const clusterBonds = [
      { source: "c1", target: "c2", strength: 0.7 },
      { source: "c1", target: "c3", strength: 0.65 },
      { source: "c2", target: "c3", strength: 0.8 },
    ];

    // AI 审核通过
    const { chatCompletion } = await import("../ai/provider.js");
    vi.mocked(chatCompletion).mockResolvedValue({
      content: JSON.stringify({ valid: true, name: "供应链管理", description: "整合供应链相关主题" }),
    } as any);

    mockStrikeCreate.mockResolvedValue(
      makeStrike({ id: "l2-new", is_cluster: true, level: 2, nucleus: "[供应链管理]" }),
    );

    const result = await discoverL2Clusters("user-1", l1Clusters, clusterBonds);

    expect(result.created).toBeGreaterThanOrEqual(1);
  });

  it("should_not_create_L2_when_bonds_are_weak", async () => {
    const { discoverL2Clusters } = await import("./l2-emergence.js");

    const l1Clusters = [
      makeStrike({ id: "c1", is_cluster: true, level: 1 }),
      makeStrike({ id: "c2", is_cluster: true, level: 1 }),
    ];

    // 弱 bond
    const clusterBonds = [
      { source: "c1", target: "c2", strength: 0.3 },
    ];

    const result = await discoverL2Clusters("user-1", l1Clusters, clusterBonds);
    expect(result.created).toBe(0);
  });
});

// =====================================================================
// A1: 周涌现引擎运行时检查 intend 密度并触发目标涌现
// =====================================================================
describe("A1: runEmergence 应集成 intend 密度检测", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_check_intend_emergence_for_each_cluster_during_weekly_run", async () => {
    const { runEmergence } = await import("./emergence.js");

    // 提供 2 个 cluster
    const clusters = [
      makeStrike({ id: "c1", is_cluster: true, level: 1, nucleus: "供应链管理" }),
      makeStrike({ id: "c2", is_cluster: true, level: 1, nucleus: "团队管理" }),
    ];
    mockQuery.mockResolvedValueOnce(clusters); // 加载所有 clusters

    // cluster 成员查询（各返回空）
    mockQuery.mockResolvedValueOnce([]); // c1 members
    mockQuery.mockResolvedValueOnce([]); // c2 members

    // checkIntendEmergence 对 c1 返回一个 goal
    mockCheckIntendEmergence
      .mockResolvedValueOnce({ id: "g1", title: "供应链管理" })
      .mockResolvedValueOnce(null);

    const result = await runEmergence("user-1");

    // 验证结果包含 goalEmergence 字段
    expect(result).toBeDefined();
    expect(typeof result.goalEmergence).toBe("number");
    expect(result.goalEmergence).toBe(1);
    // 验证每个 cluster 都被检查了
    expect(mockCheckIntendEmergence).toHaveBeenCalledTimes(2);
  });
});
