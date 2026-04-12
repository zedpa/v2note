/**
 * AI 交互素材分发（阶段 3）单元测试 — Phase 14.10
 *
 * 覆盖场景：
 * - 当日有 chat 消息时，生成 ai_diary record
 * - 当日无 chat 消息时，跳过不创建 record
 * - chat 消息过短/无实质内容时，跳过
 * - 生成的 record 使用 source_type='ai_diary'
 * - 编译变更摘要也作为 ai_diary record 创建
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/repositories/chat-message.js", () => ({
  getMessagesByDate: vi.fn(),
}));

vi.mock("../db/repositories/record.js", () => ({
  create: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  query: vi.fn(),
}));

vi.mock("../lib/tz.js", () => ({
  today: vi.fn(() => "2026-04-11"),
  todayRange: vi.fn(() => ({
    start: "2026-04-10T16:00:00.000Z",
    end: "2026-04-11T15:59:59.999Z",
  })),
}));

import { generateAiDiaryRecords } from "./ai-diary-stage.js";
import { getMessagesByDate } from "../db/repositories/chat-message.js";
import * as recordRepo from "../db/repositories/record.js";
import { query } from "../db/pool.js";

const mockGetMessages = vi.mocked(getMessagesByDate);
const mockCreateRecord = vi.mocked(recordRepo.create);
const mockQuery = vi.mocked(query);

describe("ai-diary-stage (Phase 14.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRecord.mockResolvedValue({
      id: "rec-ai-1",
      device_id: "u-1",
      user_id: "u-1",
      status: "completed",
      source: "system",
      source_type: "ai_diary",
      audio_path: null,
      duration_seconds: null,
      location_text: null,
      notebook: null,
      archived: false,
      digested: true,
      digested_at: null,
      file_url: null,
      file_name: null,
      metadata: null,
      compile_status: "pending",
      content_hash: null,
      created_at: "2026-04-11T10:00:00Z",
      updated_at: "2026-04-11T10:00:00Z",
    });
    mockQuery.mockResolvedValue([] as any);
  });

  it("should_create_ai_diary_record_when_today_has_chat_messages", async () => {
    mockGetMessages.mockResolvedValue([
      { id: "m1", user_id: "u-1", role: "user", content: "铝价最近什么情况？需要了解一下当前的市场行情和供应链的整体态势，好做下一步的采购决策", parts: null, compressed: false, created_at: "2026-04-11T09:00:00Z" },
      { id: "m2", user_id: "u-1", role: "assistant", content: "根据你最近的记录，铝价上涨了5%，建议关注供应链调整。张总也提到了原料储备的问题，建议你在下周一的会议上讨论是否提前囤积原料。", parts: null, compressed: false, created_at: "2026-04-11T09:01:00Z" },
    ]);

    const result = await generateAiDiaryRecords("u-1");

    expect(result.chatRecordsCreated).toBeGreaterThanOrEqual(1);
    expect(mockCreateRecord).toHaveBeenCalled();
    // 验证 source_type 为 ai_diary
    const createCall = mockCreateRecord.mock.calls[0][0];
    expect(createCall.source_type).toBe("ai_diary");
    expect(createCall.user_id).toBe("u-1");
  });

  it("should_skip_when_no_chat_messages_today", async () => {
    mockGetMessages.mockResolvedValue([]);

    const result = await generateAiDiaryRecords("u-1");

    expect(result.chatRecordsCreated).toBe(0);
    // 不应创建 chat 摘要类型的 record
    // 可能仍创建编译摘要 record
  });

  it("should_skip_trivial_chat_when_messages_too_short", async () => {
    mockGetMessages.mockResolvedValue([
      { id: "m1", user_id: "u-1", role: "user", content: "你好", parts: null, compressed: false, created_at: "2026-04-11T09:00:00Z" },
      { id: "m2", user_id: "u-1", role: "assistant", content: "你好！", parts: null, compressed: false, created_at: "2026-04-11T09:01:00Z" },
    ]);

    const result = await generateAiDiaryRecords("u-1");

    // 总内容太短（< 100 字符），不应创建 record
    expect(result.chatRecordsCreated).toBe(0);
  });

  it("should_create_compile_summary_record_when_compile_result_provided", async () => {
    mockGetMessages.mockResolvedValue([]);

    const result = await generateAiDiaryRecords("u-1", {
      compileSummary: "今日编译：新建 2 个 page，更新 3 个 page",
    });

    expect(result.summaryRecordCreated).toBe(true);
    // 验证创建了编译摘要 record
    const calls = mockCreateRecord.mock.calls;
    const summaryCall = calls.find(c => c[0].source === "system_compile");
    expect(summaryCall).toBeDefined();
    expect(summaryCall![0].source_type).toBe("ai_diary");
  });

  it("should_not_create_compile_summary_when_no_summary_provided", async () => {
    mockGetMessages.mockResolvedValue([]);

    const result = await generateAiDiaryRecords("u-1");

    expect(result.summaryRecordCreated).toBe(false);
  });

  it("should_use_user_id_as_device_id_fallback", async () => {
    // 当 query 查不到 device_id 时
    mockQuery.mockResolvedValue([] as any);
    mockGetMessages.mockResolvedValue([
      { id: "m1", user_id: "u-1", role: "user", content: "关于供应链的问题，铝价涨了5%需要调整采购策略，需要综合评估各个维度的影响和应对方案", parts: null, compressed: false, created_at: "2026-04-11T09:00:00Z" },
      { id: "m2", user_id: "u-1", role: "assistant", content: "根据分析，建议先囤原料，同时与张总确认报价方案。这个决策需要综合考虑多方面因素，包括库存成本、市场趋势等。", parts: null, compressed: false, created_at: "2026-04-11T09:01:00Z" },
    ]);

    await generateAiDiaryRecords("u-1");

    expect(mockCreateRecord).toHaveBeenCalled();
    const createCall = mockCreateRecord.mock.calls[0][0];
    expect(createCall.device_id).toBe("u-1");
  });
});
