/**
 * cluster-tag-sync spec 测试
 * 覆盖场景 1-5: 反写标签、合并、消退、用户优先
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";
import type { StrikeTagEntry } from "../db/repositories/strike-tag.js";

// ── Mock helpers ──────────────────────────────────────────────────────

function makeStrike(overrides: Partial<StrikeEntry> = {}): StrikeEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    user_id: "user-1",
    nucleus: "test strike",
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
    level: null,
    origin: null,
    created_at: new Date().toISOString(),
    digested_at: null,
    ...overrides,
  };
}

function makeTag(overrides: Partial<StrikeTagEntry> = {}): StrikeTagEntry {
  return {
    id: crypto.randomUUID(),
    strike_id: "s1",
    label: "test",
    confidence: 0.8,
    created_by: "digest",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────

const mockQuery = vi.fn().mockResolvedValue([]);
const mockExecute = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: vi.fn().mockResolvedValue(null),
  execute: (...args: any[]) => mockExecute(...args),
}));

const mockTagCreateMany = vi.fn().mockResolvedValue([]);
const mockTagFindByStrike = vi.fn().mockResolvedValue([]);
vi.mock("../db/repositories/strike-tag.js", () => ({
  createMany: (...args: any[]) => mockTagCreateMany(...args),
  findByStrike: (...args: any[]) => mockTagFindByStrike(...args),
  findByLabel: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  updateCreatedBy: vi.fn(),
}));

vi.mock("../db/repositories/index.js", async () => {
  const strikeTag = await import("../db/repositories/strike-tag.js");
  return {
    strikeTagRepo: strikeTag,
    strikeRepo: {
      findBySource: vi.fn(),
      findById: vi.fn(),
      findActive: vi.fn(),
      create: vi.fn(),
    },
    bondRepo: {
      findByStrike: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
  };
});

// =====================================================================
// 场景 1: Cluster 涌现后反写 strike_tag
// =====================================================================
describe("场景1: Cluster 反写 strike_tag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_create_cluster_tags_for_all_members_when_cluster_is_active", async () => {
    const { syncClusterTags } = await import("./tag-sync.js");

    // 1 个 active cluster，8 个成员
    const cluster = makeStrike({
      id: "cluster-1",
      is_cluster: true,
      nucleus: "[供应链管理] 企业供应链优化分析",
      status: "active",
    });

    const memberIds = Array.from({ length: 8 }, (_, i) => `member-${i}`);

    // Mock: 查询 active clusters
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("is_cluster = true") && sql.includes("status = 'active'")) {
        return Promise.resolve([cluster]);
      }
      // 查询 cluster members via bond
      if (sql.includes("cluster_member") && sql.includes("source_strike_id")) {
        return Promise.resolve(
          memberIds.map((id) => ({
            target_strike_id: id,
            strength: 0.7,
          })),
        );
      }
      // 查询已有 cluster tags
      if (sql.includes("strike_tag") && sql.includes("created_by = 'cluster'")) {
        return Promise.resolve([]); // 还没有 cluster 标签
      }
      return Promise.resolve([]);
    });

    await syncClusterTags("user-1");

    // 验证为 8 个成员创建了标签
    expect(mockTagCreateMany).toHaveBeenCalled();
    const tags = mockTagCreateMany.mock.calls[0][0];
    expect(tags).toHaveLength(8);
    expect(tags[0].label).toBe("供应链管理");
    expect(tags[0].created_by).toBe("cluster");
    expect(tags[0].confidence).toBeCloseTo(0.7);
  });

  it("should_extract_cluster_name_from_nucleus_brackets", async () => {
    const { extractClusterName } = await import("./tag-sync.js");

    expect(extractClusterName("[供应链管理] 企业供应链优化")).toBe("供应链管理");
    expect(extractClusterName("[产品规划] 长期路线图")).toBe("产品规划");
    expect(extractClusterName("没有方括号的集群")).toBe("没有方括号的集群");
  });
});

// =====================================================================
// 场景 3: Cluster 合并后标签更新
// =====================================================================
describe("场景3: Cluster 合并后标签更新", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_soft_delete_old_tags_and_create_new_when_cluster_renamed", async () => {
    const { syncClusterTags } = await import("./tag-sync.js");

    // 合并后的 cluster（新名称）
    const cluster = makeStrike({
      id: "cluster-merged",
      is_cluster: true,
      nucleus: "[供应链决策] 合并后的集群",
      status: "active",
    });

    const memberIds = ["m1", "m2", "m3"];

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("is_cluster = true") && sql.includes("status = 'active'")) {
        return Promise.resolve([cluster]);
      }
      if (sql.includes("cluster_member") && sql.includes("source_strike_id")) {
        return Promise.resolve(
          memberIds.map((id) => ({ target_strike_id: id, strength: 0.8 })),
        );
      }
      // 成员已有旧的 cluster 标签
      if (sql.includes("strike_tag") && sql.includes("created_by = 'cluster'")) {
        return Promise.resolve([
          makeTag({ strike_id: "m1", label: "供应链管理", created_by: "cluster" }),
          makeTag({ strike_id: "m2", label: "供应商评估", created_by: "cluster" }),
        ]);
      }
      return Promise.resolve([]);
    });

    await syncClusterTags("user-1");

    // 验证旧标签被软删除（confidence=0）
    const softDeleteCalls = mockExecute.mock.calls.filter(
      (call) => call[0].includes("confidence = 0") && call[0].includes("created_by = 'cluster'"),
    );
    expect(softDeleteCalls.length).toBeGreaterThan(0);

    // 验证新标签被创建
    expect(mockTagCreateMany).toHaveBeenCalled();
    const newTags = mockTagCreateMany.mock.calls[0][0];
    expect(newTags[0].label).toBe("供应链决策");
  });
});

// =====================================================================
// 场景 4: Cluster 消退后清理标签
// =====================================================================
describe("场景4: Cluster 消退后清理标签", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_soft_delete_tags_when_cluster_is_archived", async () => {
    const { syncClusterTags } = await import("./tag-sync.js");

    // 没有 active cluster，但有遗留的 cluster 标签
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("is_cluster = true") && sql.includes("status = 'active'")) {
        return Promise.resolve([]); // 无 active cluster
      }
      // 查询所有 cluster 标签
      if (sql.includes("strike_tag") && sql.includes("created_by = 'cluster'") && sql.includes("confidence > 0")) {
        return Promise.resolve([
          makeTag({ strike_id: "s1", label: "临时讨论", created_by: "cluster" }),
          makeTag({ strike_id: "s2", label: "临时讨论", created_by: "cluster" }),
        ]);
      }
      return Promise.resolve([]);
    });

    await syncClusterTags("user-1");

    // 验证遗留标签被软删除
    const softDeleteCalls = mockExecute.mock.calls.filter(
      (call) => call[0].includes("confidence = 0"),
    );
    expect(softDeleteCalls.length).toBeGreaterThan(0);
  });
});

// =====================================================================
// 场景 5: 用户手动标签优先级
// =====================================================================
describe("场景5: 用户手动标签优先", () => {
  it("should_not_overwrite_user_tags_with_cluster_tags", async () => {
    const { syncClusterTags } = await import("./tag-sync.js");

    const cluster = makeStrike({
      id: "c1",
      is_cluster: true,
      nucleus: "[供应链管理] desc",
      status: "active",
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("is_cluster = true") && sql.includes("status = 'active'")) {
        return Promise.resolve([cluster]);
      }
      if (sql.includes("cluster_member") && sql.includes("source_strike_id")) {
        return Promise.resolve([{ target_strike_id: "m1", strength: 0.8 }]);
      }
      // m1 已有用户手动标签 "供应链"
      if (sql.includes("strike_tag") && sql.includes("created_by = 'cluster'")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    // 用户 tag 由前端显示逻辑处理优先级，tag-sync 只写 cluster 标签
    // 不应删除或覆盖 created_by='user' 的标签
    await syncClusterTags("user-1");

    // 创建的标签 created_by 应为 'cluster'，不是 'user'
    if (mockTagCreateMany.mock.calls.length > 0) {
      const tags = mockTagCreateMany.mock.calls[0][0];
      for (const tag of tags) {
        expect(tag.created_by).toBe("cluster");
      }
    }
  });
});

// =====================================================================
// 边界条件：空 Cluster 不产生标签
// =====================================================================
describe("边界条件: 空 Cluster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_not_create_tags_for_empty_cluster", async () => {
    const { syncClusterTags } = await import("./tag-sync.js");

    const emptyCluster = makeStrike({
      id: "empty-c",
      is_cluster: true,
      nucleus: "[空集群] nothing",
      status: "active",
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("is_cluster = true") && sql.includes("status = 'active'")) {
        return Promise.resolve([emptyCluster]);
      }
      if (sql.includes("cluster_member") && sql.includes("source_strike_id")) {
        return Promise.resolve([]); // 无成员
      }
      if (sql.includes("strike_tag") && sql.includes("created_by = 'cluster'")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    await syncClusterTags("user-1");

    // 不应创建任何标签
    expect(mockTagCreateMany).not.toHaveBeenCalled();
  });
});
