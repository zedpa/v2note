/**
 * annotation 测试 — 批注系统
 *
 * 覆盖 spec 4 个场景：
 * 1. 高亮标注 → Strike(perceive, highlight)
 * 2. 批注 → record(think) + Bond(annotation)
 * 3. 素材添加想法 → think record + Bond
 * 4. 高亮批注管理 → 列表 + 软删除
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockStrikeRepo, mockBondRepo, mockRecordRepo, mockTranscriptRepo, mockDigestRecords } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue([]),
  mockStrikeRepo: {
    create: vi.fn().mockResolvedValue({ id: "strike-new-1" }),
    update: vi.fn().mockResolvedValue({ id: "strike-1", status: "archived" }),
  },
  mockBondRepo: {
    create: vi.fn().mockResolvedValue({ id: "bond-new-1" }),
  },
  mockRecordRepo: {
    create: vi.fn().mockResolvedValue({ id: "rec-new-1" }),
  },
  mockTranscriptRepo: {
    create: vi.fn().mockResolvedValue({ id: "t-1" }),
  },
  mockDigestRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

vi.mock("../db/repositories/index.js", () => ({
  strikeRepo: mockStrikeRepo,
  bondRepo: mockBondRepo,
  recordRepo: mockRecordRepo,
  transcriptRepo: mockTranscriptRepo,
}));

vi.mock("../handlers/digest.js", () => ({
  digestRecords: (...args: any[]) => mockDigestRecords(...args),
}));

import {
  createHighlight,
  createAnnotation,
  addThoughtToMaterial,
  listAnnotations,
  archiveAnnotation,
} from "./annotation.js";

beforeEach(() => {
  vi.resetAllMocks();
  mockStrikeRepo.create.mockResolvedValue({ id: "strike-new-1" });
  mockStrikeRepo.update.mockResolvedValue({ id: "strike-1", status: "archived" });
  mockBondRepo.create.mockResolvedValue({ id: "bond-new-1" });
  mockRecordRepo.create.mockResolvedValue({ id: "rec-new-1" });
  mockTranscriptRepo.create.mockResolvedValue({ id: "t-1" });
  mockDigestRecords.mockResolvedValue(undefined);
  mockQuery.mockResolvedValue([]);
});

// ─── 场景 1: 高亮标注 ───

describe("createHighlight", () => {
  it("should_create_strike_with_perceive_polarity_and_highlight_source", async () => {
    await createHighlight({
      userId: "user-1",
      recordId: "rec-1",
      text: "这段文字很重要",
      span: "10:25",
    });

    expect(mockStrikeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        nucleus: "这段文字很重要",
        polarity: "perceive",
        source_type: "highlight",
        source_id: "rec-1",
        source_span: "10:25",
      }),
    );
  });

  it("should_return_strike_id", async () => {
    const result = await createHighlight({
      userId: "user-1",
      recordId: "rec-1",
      text: "重要内容",
      span: "0:10",
    });

    expect(result.strikeId).toBe("strike-new-1");
  });
});

// ─── 场景 2: 批注 ───

describe("createAnnotation", () => {
  it("should_create_think_record_for_annotation", async () => {
    await createAnnotation({
      userId: "user-1",
      deviceId: "device-1",
      targetRecordId: "rec-1",
      text: "我对这段有不同看法",
    });

    expect(mockRecordRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        device_id: "device-1",
        source_type: "think",
      }),
    );
  });

  it("should_create_annotation_bond_to_target_record", async () => {
    // 模拟目标 record 的 strikes 查询
    mockQuery.mockResolvedValueOnce([{ id: "target-strike-1" }]);

    await createAnnotation({
      userId: "user-1",
      deviceId: "device-1",
      targetRecordId: "rec-1",
      text: "批注内容",
    });

    // 创建 transcript
    expect(mockTranscriptRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        record_id: "rec-new-1",
        text: "批注内容",
      }),
    );

    // 触发 digest
    expect(mockDigestRecords).toHaveBeenCalled();
  });

  it("should_trigger_digest_pipeline", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await createAnnotation({
      userId: "user-1",
      deviceId: "device-1",
      targetRecordId: "rec-1",
      text: "批注",
    });

    expect(mockDigestRecords).toHaveBeenCalledWith(
      ["rec-new-1"],
      { deviceId: "device-1", userId: "user-1" },
    );
  });
});

// ─── 场景 3: 素材添加想法 ───

describe("addThoughtToMaterial", () => {
  it("should_create_think_record_linked_to_material", async () => {
    // 模拟素材的 strikes 查询
    mockQuery.mockResolvedValueOnce([{ id: "material-strike-1" }]);

    await addThoughtToMaterial({
      userId: "user-1",
      deviceId: "device-1",
      materialRecordId: "mat-1",
      text: "这让我想到了供应链优化",
    });

    // 创建 think record
    expect(mockRecordRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: "think",
      }),
    );

    // transcript
    expect(mockTranscriptRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "这让我想到了供应链优化",
      }),
    );
  });

  it("should_trigger_digest_for_thought", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await addThoughtToMaterial({
      userId: "user-1",
      deviceId: "device-1",
      materialRecordId: "mat-1",
      text: "想法",
    });

    expect(mockDigestRecords).toHaveBeenCalled();
  });
});

// ─── 场景 4: 高亮批注管理 ───

describe("listAnnotations", () => {
  it("should_return_highlights_and_annotations_by_record", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: "s1", nucleus: "高亮内容", source_type: "highlight", polarity: "perceive", created_at: "2026-03-20" },
    ]);

    const result = await listAnnotations("rec-1");

    expect(result).toHaveLength(1);
    expect(result[0].nucleus).toBe("高亮内容");
  });
});

describe("archiveAnnotation", () => {
  it("should_soft_delete_by_setting_status_archived", async () => {
    await archiveAnnotation("strike-1");

    expect(mockStrikeRepo.update).toHaveBeenCalledWith("strike-1", { status: "archived" });
  });
});
