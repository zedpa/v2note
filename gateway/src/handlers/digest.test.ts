/**
 * 单元测试：digest.ts — Phase 2 Ingest 改造
 *
 * 核心变更：
 * - 去掉 Strike/Bond 拆解，只保留 intend 抽取
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
}));

vi.mock("./digest-prompt.js", () => ({
  buildIngestPrompt: vi.fn().mockReturnValue("mock ingest prompt"),
}));

vi.mock("../cognitive/todo-projector.js", () => ({
  projectIntendStrike: vi.fn().mockResolvedValue(null),
}));

// Phase 14.12: writeRecordEmbedding 已移除，Record 入库不再生成 embedding

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
  safeParseJson: vi.fn((s: string) => {
    try { return JSON.parse(s); } catch { return null; }
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
import {
  recordRepo,
  transcriptRepo,
  summaryRepo,
} from "../db/repositories/index.js";
import { projectIntendStrike } from "../cognitive/todo-projector.js";

const mockChatCompletion = vi.mocked(chatCompletion);
const mockClaimForDigest = vi.mocked(recordRepo.claimForDigest);
const mockFindById = vi.mocked(recordRepo.findById);
const mockFindByRecordIds = vi.mocked(transcriptRepo.findByRecordIds);
const mockFindSummary = vi.mocked(summaryRepo.findByRecordId);
const mockUpdateDomain = vi.mocked(recordRepo.updateDomain);
const mockUpdateCompileStatus = vi.mocked(recordRepo.updateCompileStatus);
const mockProjectIntendStrike = vi.mocked(projectIntendStrike);

// ── 辅助工厂 ──────────────────────────────────────────────────────────

function makeRecord(id: string, overrides: Record<string, any> = {}) {
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

function makeTranscript(recordId: string, text: string) {
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
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, "今天天气真好，和朋友去公园散步了"),
    ] as any);
    mockFindSummary.mockResolvedValue(null);

    // AI 返回无 intend（Phase 11: 不再返回 domain）
    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intends: [],
      }),
    } as any);

    await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });

    // 不应创建 todo
    expect(mockProjectIntendStrike).not.toHaveBeenCalled();
    // 应标记 pending_compile
    expect(mockUpdateCompileStatus).toHaveBeenCalledWith(
      recordId,
      "pending",
      expect.any(String), // content_hash
    );
    // Phase 11: domain 分配已移除，不应调用 updateDomain
    expect(mockUpdateDomain).not.toHaveBeenCalled();
  });

  it("should_create_todo_and_mark_pending_compile_when_intend_extracted", async () => {
    const recordId = "rec-intend-1";
    mockClaimForDigest.mockResolvedValue([recordId]);
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, "明天下午3点找张总确认报价"),
    ] as any);
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
    } as any);

    await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });

    // 应调用 projectIntendStrike（构造 IntendInput）
    expect(mockProjectIntendStrike).toHaveBeenCalledTimes(1);
    const input = mockProjectIntendStrike.mock.calls[0][0];
    expect(input.nucleus).toBe("明天下午3点找张总确认报价");
    expect(input.polarity).toBe("intend");
    expect(input.source_id).toBe(recordId);
    expect(input.field!.scheduled_start).toBe("2026-04-10T15:00:00");
    expect(input.field!.person).toBe("张总");
    expect(input.field!.priority).toBe("high");

    // 应标记 pending_compile
    expect(mockUpdateCompileStatus).toHaveBeenCalledWith(
      recordId,
      "pending",
      expect.any(String),
    );

  });

  it("should_generate_correct_content_hash_sha256", async () => {
    const recordId = "rec-hash-1";
    const text = "测试内容用于哈希验证";
    const expectedHash = crypto.createHash("sha256").update(text).digest("hex");

    mockClaimForDigest.mockResolvedValue([recordId]);
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, text),
    ] as any);
    mockFindSummary.mockResolvedValue(null);

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({ domain: null, intends: [] }),
    } as any);

    await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });

    expect(mockUpdateCompileStatus).toHaveBeenCalledWith(
      recordId,
      "pending",
      expectedHash,
    );
  });

  it("should_handle_ai_returning_empty_intends_gracefully", async () => {
    const recordId = "rec-empty-1";
    mockClaimForDigest.mockResolvedValue([recordId]);
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, "随便写点什么"),
    ] as any);
    mockFindSummary.mockResolvedValue(null);

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({ domain: "日常", intends: [] }),
    } as any);

    await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });

    expect(mockProjectIntendStrike).not.toHaveBeenCalled();
    // 即使无 intend，也应标记 pending_compile
    expect(mockUpdateCompileStatus).toHaveBeenCalledWith(
      recordId,
      "pending",
      expect.any(String),
    );
  });

  it("should_not_create_strike_or_bond_in_new_digest_flow", async () => {
    const recordId = "rec-no-strike";
    mockClaimForDigest.mockResolvedValue([recordId]);
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, "铝价涨了5%，准备调整方案"),
    ] as any);
    mockFindSummary.mockResolvedValue(null);

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        domain: "工作",
        intends: [
          { text: "调整采购方案", granularity: "action" },
        ],
      }),
    } as any);

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
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([] as any); // 无 transcript
    mockFindSummary.mockResolvedValue({
      record_id: recordId,
      short_summary: "这是一条摘要",
    } as any);

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({ domain: "日常", intends: [] }),
    } as any);

    await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });

    // 应使用 summary 作为文本
    expect(mockChatCompletion).toHaveBeenCalled();
    const msgs = mockChatCompletion.mock.calls[0][0];
    expect(msgs[1].content).toContain("这是一条摘要");
  });

  it("should_handle_multiple_intends_from_single_record", async () => {
    const recordId = "rec-multi-intend";
    mockClaimForDigest.mockResolvedValue([recordId]);
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, "明天找张总确认报价，后天交报告给李经理"),
    ] as any);
    mockFindSummary.mockResolvedValue(null);

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        domain: "工作",
        intends: [
          { text: "明天找张总确认报价", granularity: "action", person: "张总" },
          { text: "后天交报告给李经理", granularity: "action", person: "李经理" },
        ],
      }),
    } as any);

    await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });

    expect(mockProjectIntendStrike).toHaveBeenCalledTimes(2);
    expect(mockProjectIntendStrike.mock.calls[0][0].nucleus).toBe("明天找张总确认报价");
    expect(mockProjectIntendStrike.mock.calls[1][0].nucleus).toBe("后天交报告给李经理");
  });

  it("should_unclaim_records_when_ai_response_parse_fails", async () => {
    const recordId = "rec-parse-fail";
    mockClaimForDigest.mockResolvedValue([recordId]);
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, "一些内容"),
    ] as any);
    mockFindSummary.mockResolvedValue(null);

    mockChatCompletion.mockResolvedValue({
      content: "这不是有效的 JSON",
    } as any);

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
    await expect(
      digestRecords(["rec-1"], { deviceId: "dev-1" }),
    ).resolves.toBeUndefined();
  });

  it("should_project_intend_without_granularity_in_fake_strike_field", async () => {
    // Phase 14.2: AI 不再返回 granularity，digest 不再传递 granularity 到 field
    const recordId = "rec-goal-1";
    mockClaimForDigest.mockResolvedValue([recordId]);
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, "今年把身体搞好"),
    ] as any);
    mockFindSummary.mockResolvedValue(null);

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        domain: "健康",
        intends: [
          { text: "今年把身体搞好" },
        ],
      }),
    } as any);

    await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });

    expect(mockProjectIntendStrike).toHaveBeenCalledTimes(1);
    const input = mockProjectIntendStrike.mock.calls[0][0];
    expect(input.polarity).toBe("intend");
    expect(input.source_id).toBe(recordId);
    expect(input.user_id).toBe("user-1");
  });

  // Phase 14.12: 验证不再生成 record embedding
  it("should_not_call_writeRecordEmbedding_after_phase14_12", async () => {
    const recordId = "rec-no-embed";
    mockClaimForDigest.mockResolvedValue([recordId]);
    mockFindById.mockResolvedValue(makeRecord(recordId) as any);
    mockFindByRecordIds.mockResolvedValue([
      makeTranscript(recordId, "测试不生成 embedding"),
    ] as any);
    mockFindSummary.mockResolvedValue(null);

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({ intends: [] }),
    } as any);

    await digestRecords([recordId], { deviceId: "dev-1", userId: "user-1" });

    // writeRecordEmbedding 模块已被移除，不应有任何 embedding 写入
    // 验证 pending_compile 正常标记
    expect(mockUpdateCompileStatus).toHaveBeenCalledWith(
      recordId,
      "pending",
      expect.any(String),
    );
  });
});
