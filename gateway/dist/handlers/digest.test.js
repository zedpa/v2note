/**
 * 单元测试：digest.ts — Phase 2 Ingest 改造
 *
 * 核心变更：
 * - 去掉 Strike/Bond 拆解，只保留 intend 抽取
 * - 生成 record-level embedding
 * - 生成 content_hash（SHA256）
 * - Record 标记为 pending_compile
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
// ── Mock 外部依赖 ──────────────────────────────────────────────────────
vi.mock("../ai/provider.js", () => ({
    chatCompletion: vi.fn(),
}));
vi.mock("../db/repositories/index.js", () => ({
    recordRepo: {
        findById: vi.fn(),
        claimForDigest: vi.fn(),
        unclaimDigest: vi.fn().mockResolvedValue(undefined),
        listUserDomains: vi.fn().mockResolvedValue([]),
        updateDomain: vi.fn().mockResolvedValue(undefined),
        updateCompileStatus: vi.fn().mockResolvedValue(undefined),
    },
    transcriptRepo: {
        findByRecordIds: vi.fn().mockResolvedValue([]),
    },
    summaryRepo: {
        findByRecordId: vi.fn().mockResolvedValue(null),
    },
    strikeRepo: {},
    bondRepo: {},
    snapshotRepo: {},
}));
vi.mock("./digest-prompt.js", () => ({
    buildIngestPrompt: vi.fn().mockReturnValue("mock ingest prompt"),
}));
vi.mock("../cognitive/todo-projector.js", () => ({
    projectIntendStrike: vi.fn().mockResolvedValue(null),
}));
vi.mock("../cognitive/embed-writer.js", () => ({
    writeRecordEmbedding: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../session/manager.js", () => ({
    getSession: vi.fn().mockReturnValue({
        memoryManager: {
            maybeCreateMemory: vi.fn().mockResolvedValue(undefined),
        },
    }),
}));
vi.mock("../soul/manager.js", () => ({
    updateSoul: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../profile/manager.js", () => ({
    updateProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/text-utils.js", () => ({
    safeParseJson: vi.fn((s) => {
        try {
            return JSON.parse(s);
        }
        catch {
            return null;
        }
    }),
    mayProfileUpdate: vi.fn().mockReturnValue(false),
}));
vi.mock("../cognitive/self-evolution.js", () => ({
    shouldUpdateSoulStrict: vi.fn().mockReturnValue(false),
}));
vi.mock("../lib/tz.js", () => ({
    today: vi.fn().mockReturnValue("2026-04-09"),
    now: vi.fn().mockReturnValue(new Date("2026-04-09T12:00:00+08:00")),
}));
// ── 导入被测模块和 mock ────────────────────────────────────────────
import { digestRecords } from "./digest.js";
import { chatCompletion } from "../ai/provider.js";
import { recordRepo, transcriptRepo, summaryRepo, } from "../db/repositories/index.js";
import { projectIntendStrike } from "../cognitive/todo-projector.js";
import { writeRecordEmbedding } from "../cognitive/embed-writer.js";
const mockChatCompletion = vi.mocked(chatCompletion);
const mockClaimForDigest = vi.mocked(recordRepo.claimForDigest);
const mockFindById = vi.mocked(recordRepo.findById);
const mockFindByRecordIds = vi.mocked(transcriptRepo.findByRecordIds);
const mockFindSummary = vi.mocked(summaryRepo.findByRecordId);
const mockUpdateDomain = vi.mocked(recordRepo.updateDomain);
const mockUpdateCompileStatus = vi.mocked(recordRepo.updateCompileStatus);
const mockProjectIntendStrike = vi.mocked(projectIntendStrike);
const mockWriteRecordEmbedding = vi.mocked(writeRecordEmbedding);
// ── 辅助工厂 ──────────────────────────────────────────────────────────
function makeRecord(id, overrides = {}) {
    return {
        id,
        device_id: "dev-1",
        user_id: "user-1",
        status: "completed",
        source: "manual",
        source_type: "think",
        digested: false,
        ...overrides,
    };
}
function makeTranscript(recordId, text) {
    return { record_id: recordId, text };
}
// ── 测试 ──────────────────────────────────────────────────────────────
describe("digestRecords (Phase 2 — Ingest 改造)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should_skip_digest_when_all_records_already_claimed", async () => {
        mockClaimForDigest.mockResolvedValue([]);
        await digestRecords(["rec-1"], { deviceId: "dev-1", userId: "user-1" });
        expect(mockChatCompletion).not.toHaveBeenCalled();
        expect(mockUpdateCompileStatus).not.toHaveBeenCalled();
    });
    it("should_mark_pending_compile_when_pure_diary_no_intend", async () => {
        const recordId = "rec-diary-1";
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([
            makeTranscript(recordId, "今天天气真好，和朋友去公园散步了"),
        ]);
        mockFindSummary.mockResolvedValue(null);
        // AI 返回无 intend（Phase 11: 不再返回 domain）
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                intends: [],
            }),
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        // 不应创建 todo
        expect(mockProjectIntendStrike).not.toHaveBeenCalled();
        // 应标记 pending_compile
        expect(mockUpdateCompileStatus).toHaveBeenCalledWith(recordId, "pending", expect.any(String));
        // Phase 11: domain 分配已移除，不应调用 updateDomain
        expect(mockUpdateDomain).not.toHaveBeenCalled();
        // 应生成 record embedding
        expect(mockWriteRecordEmbedding).toHaveBeenCalledWith(recordId, expect.any(String));
    });
    it("should_create_todo_and_mark_pending_compile_when_intend_extracted", async () => {
        const recordId = "rec-intend-1";
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([
            makeTranscript(recordId, "明天下午3点找张总确认报价"),
        ]);
        mockFindSummary.mockResolvedValue(null);
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                domain: "工作/采购",
                intends: [
                    {
                        text: "明天下午3点找张总确认报价",
                        granularity: "action",
                        scheduled_start: "2026-04-10T15:00:00",
                        person: "张总",
                        priority: "high",
                    },
                ],
            }),
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        // 应调用 projectIntendStrike（构造 fake StrikeEntry）
        expect(mockProjectIntendStrike).toHaveBeenCalledTimes(1);
        const fakeStrike = mockProjectIntendStrike.mock.calls[0][0];
        expect(fakeStrike.nucleus).toBe("明天下午3点找张总确认报价");
        expect(fakeStrike.polarity).toBe("intend");
        expect(fakeStrike.source_id).toBe(recordId);
        expect(fakeStrike.field.granularity).toBe("action");
        expect(fakeStrike.field.scheduled_start).toBe("2026-04-10T15:00:00");
        expect(fakeStrike.field.person).toBe("张总");
        expect(fakeStrike.field.priority).toBe("high");
        // 应标记 pending_compile
        expect(mockUpdateCompileStatus).toHaveBeenCalledWith(recordId, "pending", expect.any(String));
        // 应生成 record embedding
        expect(mockWriteRecordEmbedding).toHaveBeenCalledWith(recordId, expect.stringContaining("明天下午3点找张总确认报价"));
    });
    it("should_generate_correct_content_hash_sha256", async () => {
        const recordId = "rec-hash-1";
        const text = "测试内容用于哈希验证";
        const expectedHash = crypto.createHash("sha256").update(text).digest("hex");
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([
            makeTranscript(recordId, text),
        ]);
        mockFindSummary.mockResolvedValue(null);
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({ domain: null, intends: [] }),
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        expect(mockUpdateCompileStatus).toHaveBeenCalledWith(recordId, "pending", expectedHash);
    });
    it("should_handle_ai_returning_empty_intends_gracefully", async () => {
        const recordId = "rec-empty-1";
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([
            makeTranscript(recordId, "随便写点什么"),
        ]);
        mockFindSummary.mockResolvedValue(null);
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({ domain: "日常", intends: [] }),
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        expect(mockProjectIntendStrike).not.toHaveBeenCalled();
        // 即使无 intend，也应标记 pending_compile
        expect(mockUpdateCompileStatus).toHaveBeenCalledWith(recordId, "pending", expect.any(String));
        expect(mockWriteRecordEmbedding).toHaveBeenCalled();
    });
    it("should_not_create_strike_or_bond_in_new_digest_flow", async () => {
        const recordId = "rec-no-strike";
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([
            makeTranscript(recordId, "铝价涨了5%，准备调整方案"),
        ]);
        mockFindSummary.mockResolvedValue(null);
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                domain: "工作",
                intends: [
                    { text: "调整采购方案", granularity: "action" },
                ],
            }),
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        // 确认未导入或调用任何 Strike/Bond 相关函数
        // strikeRepo 和 bondRepo 不应被调用（我们在 mock 中未给它们方法，如果调用会报错）
        // 关键是没有写入 strike 或 bond
        expect(mockProjectIntendStrike).toHaveBeenCalledTimes(1);
        expect(mockUpdateCompileStatus).toHaveBeenCalled();
    });
    it("should_use_summary_when_transcript_not_available", async () => {
        const recordId = "rec-summary-1";
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([]); // 无 transcript
        mockFindSummary.mockResolvedValue({
            record_id: recordId,
            short_summary: "这是一条摘要",
        });
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({ domain: "日常", intends: [] }),
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        // 应使用 summary 作为文本
        expect(mockChatCompletion).toHaveBeenCalled();
        const msgs = mockChatCompletion.mock.calls[0][0];
        expect(msgs[1].content).toContain("这是一条摘要");
    });
    it("should_handle_multiple_intends_from_single_record", async () => {
        const recordId = "rec-multi-intend";
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([
            makeTranscript(recordId, "明天找张总确认报价，后天交报告给李经理"),
        ]);
        mockFindSummary.mockResolvedValue(null);
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                domain: "工作",
                intends: [
                    { text: "明天找张总确认报价", granularity: "action", person: "张总" },
                    { text: "后天交报告给李经理", granularity: "action", person: "李经理" },
                ],
            }),
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        expect(mockProjectIntendStrike).toHaveBeenCalledTimes(2);
        expect(mockProjectIntendStrike.mock.calls[0][0].nucleus).toBe("明天找张总确认报价");
        expect(mockProjectIntendStrike.mock.calls[1][0].nucleus).toBe("后天交报告给李经理");
    });
    it("should_unclaim_records_when_ai_response_parse_fails", async () => {
        const recordId = "rec-parse-fail";
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([
            makeTranscript(recordId, "一些内容"),
        ]);
        mockFindSummary.mockResolvedValue(null);
        mockChatCompletion.mockResolvedValue({
            content: "这不是有效的 JSON",
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        // 解析失败应 unclaim
        expect(recordRepo.unclaimDigest).toHaveBeenCalledWith(recordId);
        expect(mockUpdateCompileStatus).not.toHaveBeenCalled();
    });
    it("should_preserve_digest_function_signature", async () => {
        // 确认 digestRecords 接受 (string[], { deviceId, userId? }) 签名
        expect(typeof digestRecords).toBe("function");
        // 不传 userId 也不应抛异常（应从 record 查找）
        mockClaimForDigest.mockResolvedValue([]);
        await expect(digestRecords(["rec-1"], { deviceId: "dev-1" })).resolves.toBeUndefined();
    });
    it("should_project_goal_intend_with_correct_fake_strike", async () => {
        const recordId = "rec-goal-1";
        mockClaimForDigest.mockResolvedValue([recordId]);
        mockFindById.mockResolvedValue(makeRecord(recordId));
        mockFindByRecordIds.mockResolvedValue([
            makeTranscript(recordId, "今年把身体搞好"),
        ]);
        mockFindSummary.mockResolvedValue(null);
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                domain: "健康",
                intends: [
                    { text: "今年把身体搞好", granularity: "goal" },
                ],
            }),
        });
        await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });
        expect(mockProjectIntendStrike).toHaveBeenCalledTimes(1);
        const fakeStrike = mockProjectIntendStrike.mock.calls[0][0];
        expect(fakeStrike.polarity).toBe("intend");
        expect(fakeStrike.field.granularity).toBe("goal");
        expect(fakeStrike.source_id).toBe(recordId);
        expect(fakeStrike.user_id).toBe("user-1");
        expect(fakeStrike.confidence).toBe(0.9);
        expect(fakeStrike.salience).toBe(1.0);
        // fake strike should have a valid UUID id
        expect(fakeStrike.id).toBeDefined();
        expect(typeof fakeStrike.id).toBe("string");
    });
});
//# sourceMappingURL=digest.test.js.map