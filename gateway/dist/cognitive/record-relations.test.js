/**
 * cold-start-bonds spec 测试
 * 覆盖场景 1-5: 跨记录 bond、日记级聚合、关联计数、冷启动关联、无关联不显示
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mock helpers ──────────────────────────────────────────────────────
function makeStrike(overrides = {}) {
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
function makeBond(overrides = {}) {
    return {
        id: crypto.randomUUID(),
        source_strike_id: "s1",
        target_strike_id: "s2",
        type: "resonance",
        strength: 0.6,
        created_by: "digest-cross",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}
// ── Mock DB ───────────────────────────────────────────────────────────
const mockQuery = vi.fn().mockResolvedValue([]);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn(),
}));
vi.mock("../db/repositories/index.js", () => ({
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
    summaryRepo: {
        findByRecordId: vi.fn(),
    },
}));
// =====================================================================
// 场景 2: 日记级关联度聚合
// =====================================================================
describe("场景2: 日记级关联度聚合", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should_aggregate_bonds_to_record_level_with_correct_formula", async () => {
        const { computeRecordRelations } = await import("./record-relations.js");
        // 日记 A: 3 个 strike (rec-a)
        const strikesA = [
            makeStrike({ id: "a1", source_id: "rec-a" }),
            makeStrike({ id: "a2", source_id: "rec-a" }),
            makeStrike({ id: "a3", source_id: "rec-a" }),
        ];
        // 日记 B: 2 个 strike (rec-b)
        const strikesB = [
            makeStrike({ id: "b1", source_id: "rec-b" }),
            makeStrike({ id: "b2", source_id: "rec-b" }),
        ];
        // 4 条跨日记 bond (a↔b)
        const crossBonds = [
            makeBond({ source_strike_id: "a1", target_strike_id: "b1", strength: 0.6 }),
            makeBond({ source_strike_id: "a1", target_strike_id: "b2", strength: 0.7 }),
            makeBond({ source_strike_id: "a2", target_strike_id: "b1", strength: 0.5 }),
            makeBond({ source_strike_id: "a3", target_strike_id: "b2", strength: 0.8 }),
        ];
        // 期望关联度 = Σ(strength) / max(3, 2) = (0.6+0.7+0.5+0.8) / 3 = 2.6/3 ≈ 0.867
        const result = await computeRecordRelations("rec-a", strikesA, crossBonds, { "rec-b": strikesB.length }, {}, { "b1": "rec-b", "b2": "rec-b" });
        expect(result).toHaveLength(1);
        expect(result[0].record_id).toBe("rec-b");
        expect(result[0].relevance).toBeCloseTo(2.6 / 3, 2);
    });
    it("should_only_return_records_with_relevance_above_0.4", async () => {
        const { computeRecordRelations } = await import("./record-relations.js");
        const strikesA = [
            makeStrike({ id: "a1", source_id: "rec-a" }),
            makeStrike({ id: "a2", source_id: "rec-a" }),
            makeStrike({ id: "a3", source_id: "rec-a" }),
        ];
        // 弱关联：单条低 strength
        const weakBonds = [
            makeBond({ source_strike_id: "a1", target_strike_id: "c1", strength: 0.3 }),
        ];
        // 关联度 = 0.3 / max(3, 2) = 0.1 < 0.4
        const result = await computeRecordRelations("rec-a", strikesA, weakBonds, { "rec-c": 2 }, {}, { "c1": "rec-c" });
        expect(result).toHaveLength(0);
    });
    it("should_downweight_material_bond_strength_by_0.2", async () => {
        const { computeRecordRelations } = await import("./record-relations.js");
        // 日记 A: 2 think strikes
        const strikesA = [
            makeStrike({ id: "a1", source_id: "rec-a", source_type: "think" }),
            makeStrike({ id: "a2", source_id: "rec-a", source_type: "think" }),
        ];
        // 日记 D: 2 material strikes
        // bond 连接 think ↔ material
        const materialBonds = [
            makeBond({ source_strike_id: "a1", target_strike_id: "d1", strength: 0.8 }),
            makeBond({ source_strike_id: "a2", target_strike_id: "d2", strength: 0.9 }),
        ];
        // material 降权后: (0.8*0.2 + 0.9*0.2) / max(2,2) = (0.16+0.18)/2 = 0.17
        const result = await computeRecordRelations("rec-a", strikesA, materialBonds, { "rec-d": 2 }, { "d1": "material", "d2": "material" }, { "d1": "rec-d", "d2": "rec-d" });
        expect(result).toHaveLength(0); // 0.17 < 0.4 threshold
    });
    it("should_return_max_10_records_sorted_by_relevance_desc", async () => {
        const { computeRecordRelations } = await import("./record-relations.js");
        const strikesA = [makeStrike({ id: "a1", source_id: "rec-a" })];
        // 12 条到不同记录的强 bond
        const bonds = Array.from({ length: 12 }, (_, i) => makeBond({
            source_strike_id: "a1",
            target_strike_id: `x${i}`,
            strength: 0.5 + i * 0.03,
        }));
        const strikeCounts = {};
        const strikeToRecord = {};
        for (let i = 0; i < 12; i++) {
            strikeCounts[`rec-x${i}`] = 1;
            strikeToRecord[`x${i}`] = `rec-x${i}`;
        }
        const result = await computeRecordRelations("rec-a", strikesA, bonds, strikeCounts, {}, strikeToRecord);
        expect(result.length).toBeLessThanOrEqual(10);
        // 验证降序排列
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].relevance).toBeGreaterThanOrEqual(result[i].relevance);
        }
    });
});
// =====================================================================
// 场景 5: 无关联时返回空
// =====================================================================
describe("场景5: 无关联时不显示", () => {
    it("should_return_empty_array_when_no_bonds_exist", async () => {
        const { computeRecordRelations } = await import("./record-relations.js");
        const strikesA = [makeStrike({ id: "a1", source_id: "rec-a" })];
        const result = await computeRecordRelations("rec-a", strikesA, [], {});
        expect(result).toEqual([]);
    });
});
// =====================================================================
// 场景 1 & 4: 跨记录 bond（确认 digest 已实现）+ 冷启动
// =====================================================================
describe("场景1 & 4: 跨记录 bond 在 digest 中产生", () => {
    it("should_exclude_self_record_bonds_from_aggregation", async () => {
        const { computeRecordRelations } = await import("./record-relations.js");
        const strikesA = [
            makeStrike({ id: "a1", source_id: "rec-a" }),
            makeStrike({ id: "a2", source_id: "rec-a" }),
        ];
        // 同一 record 内部的 bond 不应计入跨日记关联
        const internalBonds = [
            makeBond({ source_strike_id: "a1", target_strike_id: "a2", strength: 0.9 }),
        ];
        const result = await computeRecordRelations("rec-a", strikesA, internalBonds, {});
        expect(result).toHaveLength(0);
    });
});
//# sourceMappingURL=record-relations.test.js.map