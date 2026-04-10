/**
 * regression: fix-image-thumbnail
 * 图片 ingest 后端测试 — 验证 source 字段和 Vision AI 降级逻辑
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 所有外部依赖 ──────────────────────────────────────────

vi.mock("../db/repositories/index.js", () => ({
  recordRepo: {
    create: vi.fn().mockResolvedValue({ id: "rec-img-1" }),
  },
  transcriptRepo: {
    create: vi.fn().mockResolvedValue({}),
  },
  summaryRepo: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../handlers/digest.js", () => ({
  digestRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/vision.js", () => ({
  describeImage: vi.fn(),
}));

vi.mock("../storage/oss.js", () => ({
  uploadFile: vi.fn(),
  isOssConfigured: vi.fn(() => false),
}));

vi.mock("../ingest/url-extractor.js", () => ({
  extractUrl: vi.fn(),
}));

vi.mock("../ingest/file-parser.js", () => ({
  parseFile: vi.fn(),
}));

vi.mock("../lib/http-helpers.js", () => ({
  readBody: vi.fn(),
  sendJson: vi.fn(),
  getDeviceId: vi.fn(() => "dev-1"),
  getUserId: vi.fn(() => "user-1"),
}));

import { recordRepo, summaryRepo } from "../db/repositories/index.js";
import { describeImage } from "../ai/vision.js";
import { readBody, sendJson } from "../lib/http-helpers.js";
import { registerIngestRoutes } from "./ingest.js";

// 捕获注册的 handler
type Handler = (req: any, res: any, params: any, query: any) => Promise<void>;
let ingestHandler: Handler;

const fakeRouter = {
  post: vi.fn((path: string, handler: Handler) => {
    if (path === "/api/v1/ingest") {
      ingestHandler = handler;
    }
  }),
};

describe("regression: fix-image-thumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerIngestRoutes(fakeRouter as any);
  });

  it("should_set_source_to_image_when_ingesting_image", async () => {
    vi.mocked(readBody).mockResolvedValue({
      type: "image",
      file_base64: "AAAA", // 最小合法 base64
    });
    vi.mocked(describeImage).mockResolvedValue({
      success: true,
      text: "一张风景照片",
    });

    await ingestHandler({} as any, {} as any, {}, {});

    expect(recordRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: "image" }),
    );
  });

  it("should_set_title_to_图片_and_empty_short_summary_when_vision_fails", async () => {
    vi.mocked(readBody).mockResolvedValue({
      type: "image",
      file_base64: "AAAA",
    });
    vi.mocked(describeImage).mockResolvedValue({
      success: false,
      text: "[图片内容无法识别]",
    });

    await ingestHandler({} as any, {} as any, {}, {});

    expect(summaryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "图片",
        short_summary: "",
      }),
    );
  });

  it("should_use_vision_text_for_title_and_summary_when_vision_succeeds", async () => {
    vi.mocked(readBody).mockResolvedValue({
      type: "image",
      file_base64: "AAAA",
    });
    vi.mocked(describeImage).mockResolvedValue({
      success: true,
      text: "这是一张包含山脉和湖泊的风景照片，背景有蓝天白云",
    });

    await ingestHandler({} as any, {} as any, {}, {});

    expect(summaryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "这是一张包含山脉和湖泊的风景照片，背景有蓝天白云".slice(0, 50),
        short_summary: "这是一张包含山脉和湖泊的风景照片，背景有蓝天白云",
      }),
    );
  });
});
