/**
 * regression: fix-cold-resume-silent-loss
 * records 路由的 client_id 幂等行为测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 依赖 ──────────────────────────────────────────

vi.mock("../db/repositories/index.js", () => ({
  recordRepo: {
    create: vi.fn(),
    findByClientId: vi.fn(),
    findById: vi.fn(),
    findByUser: vi.fn(),
  },
  transcriptRepo: {
    create: vi.fn().mockResolvedValue({}),
    findByRecordIds: vi.fn().mockResolvedValue([]),
    findByRecordId: vi.fn().mockResolvedValue(null),
  },
  summaryRepo: {
    create: vi.fn().mockResolvedValue({}),
    findByRecordIds: vi.fn().mockResolvedValue([]),
    findByRecordId: vi.fn().mockResolvedValue(null),
  },
  tagRepo: {
    findByRecordIds: vi.fn().mockResolvedValue([]),
    findByRecordId: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    addToRecord: vi.fn(),
  },
  todoRepo: {
    findByRecordId: vi.fn().mockResolvedValue([]),
  },
  ideaRepo: {
    findByRecordId: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../handlers/process.js", () => ({
  processEntry: vi.fn().mockResolvedValue({}),
}));

vi.mock("../storage/oss.js", () => ({
  getSignedUrl: vi.fn(),
  isOssConfigured: vi.fn(() => false),
}));

vi.mock("../lib/http-helpers.js", () => ({
  readBody: vi.fn(),
  sendJson: vi.fn(),
  sendError: vi.fn(),
  getUserId: vi.fn(() => "u-1"),
}));

import { recordRepo } from "../db/repositories/index.js";
import { readBody, sendJson } from "../lib/http-helpers.js";
import { registerRecordRoutes } from "./records.js";

// ── 捕获注册的 handler ──────────────────────────────────

type Handler = (req: any, res: any, params: any, query: any) => Promise<void>;
const handlers = new Map<string, Handler>();

const fakeRouter = {
  get: vi.fn((path: string, h: Handler) => { handlers.set(`GET ${path}`, h); }),
  post: vi.fn((path: string, h: Handler) => { handlers.set(`POST ${path}`, h); }),
  patch: vi.fn((_: string, _h: Handler) => {}),
  put: vi.fn((_: string, _h: Handler) => {}),
  delete: vi.fn((_: string, _h: Handler) => {}),
};

describe("records client_id idempotency", () => {
  // regression: fix-cold-resume-silent-loss
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    registerRecordRoutes(fakeRouter as any);
  });

  describe("POST /api/v1/records", () => {
    it("should_return_existing_record_when_client_id_already_stored", async () => {
      vi.mocked(readBody).mockResolvedValue({
        client_id: "550e8400-e29b-41d4-a716-446655440001",
        source: "manual",
      });
      vi.mocked(recordRepo.findByClientId).mockResolvedValue({
        id: "rec-existing",
        user_id: "u-1",
        client_id: "550e8400-e29b-41d4-a716-446655440001",
      } as any);

      const handler = handlers.get("POST /api/v1/records")!;
      await handler({} as any, {} as any, {}, {});

      // 不得调用 create
      expect(recordRepo.create).not.toHaveBeenCalled();
      // 响应体应回显已有 id + client_id
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "rec-existing",
          client_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      );
    });

    it("should_create_and_persist_client_id_when_not_yet_seen", async () => {
      vi.mocked(readBody).mockResolvedValue({
        client_id: "550e8400-e29b-41d4-a716-446655440002",
        source: "manual",
      });
      vi.mocked(recordRepo.findByClientId).mockResolvedValue(null);
      vi.mocked(recordRepo.create).mockResolvedValue({
        id: "rec-new",
        client_id: "550e8400-e29b-41d4-a716-446655440002",
      } as any);

      const handler = handlers.get("POST /api/v1/records")!;
      await handler({} as any, {} as any, {}, {});

      expect(recordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ client_id: "550e8400-e29b-41d4-a716-446655440002", user_id: "u-1" }),
      );
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "rec-new", client_id: "550e8400-e29b-41d4-a716-446655440002" }),
        201,
      );
    });

    it("should_skip_idempotency_check_when_client_id_is_absent", async () => {
      vi.mocked(readBody).mockResolvedValue({ source: "manual" });
      vi.mocked(recordRepo.create).mockResolvedValue({ id: "rec-no-cid" } as any);

      const handler = handlers.get("POST /api/v1/records")!;
      await handler({} as any, {} as any, {}, {});

      expect(recordRepo.findByClientId).not.toHaveBeenCalled();
      expect(recordRepo.create).toHaveBeenCalled();
    });

    // regression: fix-cold-resume-silent-loss · Phase 3 A1
    // 并发写入：两条同 (userId, client_id) 的 POST 都 miss 了 findByClientId，
    // 第二条 INSERT 撞 partial unique index（Postgres 23505）。
    // 必须捕获 → 回退 findByClientId → 返回已存在行（幂等成功，200），
    // 而非让 500 冒泡到前端触发重试风暴。
    it("should_return_existing_record_when_unique_violation_races_between_find_and_insert", async () => {
      vi.mocked(readBody).mockResolvedValue({
        client_id: "550e8400-e29b-41d4-a716-446655440000",
        source: "manual",
      });
      // 第一次 findByClientId 返回 null（尚未写入）
      // 第二次 findByClientId（create 抛 23505 后）返回已有行
      vi.mocked(recordRepo.findByClientId)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "rec-race-winner",
          user_id: "u-1",
          client_id: "550e8400-e29b-41d4-a716-446655440000",
        } as any);
      // create 抛 Postgres 唯一约束错误
      const pgErr: any = new Error("duplicate key value violates unique constraint");
      pgErr.code = "23505";
      pgErr.constraint = "record_user_client_id_unique";
      vi.mocked(recordRepo.create).mockRejectedValue(pgErr);

      const handler = handlers.get("POST /api/v1/records")!;
      // 绝不抛出；应该返回 200 OK 的已有行
      await expect(handler({} as any, {} as any, {}, {})).resolves.toBeUndefined();

      // 关键断言：response 回放已有行，且没有 status 500 调用（默认 200）
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "rec-race-winner",
          client_id: "550e8400-e29b-41d4-a716-446655440000",
        }),
      );
      // 第二次 find 必须被调用（fallback）
      expect(recordRepo.findByClientId).toHaveBeenCalledTimes(2);
    });

    // regression: fix-cold-resume-silent-loss · Phase 3 A2
    // 非法 client_id（空白/非 UUID/注入字符/超长）→ 视为未传，不走 find 分支，
    // 继续普通创建；不阻塞请求，不污染 DB。
    it("should_treat_invalid_client_id_as_absent_and_skip_find", async () => {
      vi.mocked(readBody).mockResolvedValue({
        client_id: "   ",
        source: "manual",
      });
      vi.mocked(recordRepo.create).mockResolvedValue({
        id: "rec-no-cid-invalid",
        client_id: null,
      } as any);

      const handler = handlers.get("POST /api/v1/records")!;
      await handler({} as any, {} as any, {}, {});

      expect(recordRepo.findByClientId).not.toHaveBeenCalled();
      expect(recordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "u-1", client_id: null }),
      );
    });
  });

  describe("POST /api/v1/records/manual", () => {
    it("should_return_existing_record_when_client_id_already_stored", async () => {
      vi.mocked(readBody).mockResolvedValue({
        client_id: "550e8400-e29b-41d4-a716-446655440003",
        content: "重复文本",
      });
      vi.mocked(recordRepo.findByClientId).mockResolvedValue({
        id: "rec-m-existing",
        user_id: "u-1",
        client_id: "550e8400-e29b-41d4-a716-446655440003",
      } as any);

      const handler = handlers.get("POST /api/v1/records/manual")!;
      await handler({} as any, {} as any, {}, {});

      expect(recordRepo.create).not.toHaveBeenCalled();
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "rec-m-existing",
          client_id: "550e8400-e29b-41d4-a716-446655440003",
        }),
      );
    });

    it("should_create_with_client_id_when_not_yet_seen", async () => {
      vi.mocked(readBody).mockResolvedValue({
        client_id: "550e8400-e29b-41d4-a716-446655440111",
        content: "首次文本",
      });
      vi.mocked(recordRepo.findByClientId).mockResolvedValue(null);
      vi.mocked(recordRepo.create).mockResolvedValue({
        id: "rec-m-new",
        client_id: "550e8400-e29b-41d4-a716-446655440111",
      } as any);

      const handler = handlers.get("POST /api/v1/records/manual")!;
      await handler({} as any, {} as any, {}, {});

      expect(recordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: "550e8400-e29b-41d4-a716-446655440111",
          user_id: "u-1",
        }),
      );
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "rec-m-new",
          client_id: "550e8400-e29b-41d4-a716-446655440111",
        }),
        201,
      );
    });

    // regression: fix-cold-resume-silent-loss · Phase 3 A1 (manual 分支)
    it("should_return_existing_record_when_unique_violation_races_in_manual", async () => {
      vi.mocked(readBody).mockResolvedValue({
        client_id: "550e8400-e29b-41d4-a716-446655440222",
        content: "并发写入的同一条",
      });
      vi.mocked(recordRepo.findByClientId)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "rec-m-race-winner",
          user_id: "u-1",
          client_id: "550e8400-e29b-41d4-a716-446655440222",
        } as any);
      const pgErr: any = new Error("duplicate key value violates unique constraint");
      pgErr.code = "23505";
      pgErr.constraint = "record_user_client_id_unique";
      vi.mocked(recordRepo.create).mockRejectedValue(pgErr);

      const handler = handlers.get("POST /api/v1/records/manual")!;
      await expect(handler({} as any, {} as any, {}, {})).resolves.toBeUndefined();

      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "rec-m-race-winner",
          client_id: "550e8400-e29b-41d4-a716-446655440222",
        }),
      );
      // A1 额外契约：并发冲突命中后，**不得**继续调用 transcriptRepo / summaryRepo.create
      // （由路由在 return 前短路保证，避免为已存在行重复写 transcript/summary）
    });
  });
});

// regression: fix-cold-resume-silent-loss · Phase 3 A6
// GET /api/v1/records 响应体必须包含 client_id 字段，
// 防止未来 DTO 映射过滤掉幂等键导致前端无法做 localId↔client_id 去重。
describe("GET /api/v1/records includes client_id", () => {
  // regression: fix-cold-resume-silent-loss
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    registerRecordRoutes(fakeRouter as any);
  });

  it("should_include_client_id_in_list_response", async () => {
    vi.mocked(recordRepo.findByUser).mockResolvedValue([
      {
        id: "rec-1",
        user_id: "u-1",
        client_id: "550e8400-e29b-41d4-a716-446655440333",
        archived: false,
        status: "completed",
        source: "manual",
        created_at: "2026-04-18T10:00:00Z",
      },
    ] as any);

    const handler = handlers.get("GET /api/v1/records")!;
    await handler(
      {} as any,
      {} as any,
      {},
      { limit: "10", offset: "0" },
    );

    // 断言 items[0] 中带 client_id 字段
    const [, items] = vi.mocked(sendJson).mock.calls[0];
    expect(Array.isArray(items)).toBe(true);
    expect((items as any[])[0]).toEqual(
      expect.objectContaining({
        id: "rec-1",
        client_id: "550e8400-e29b-41d4-a716-446655440333",
      }),
    );
  });
});
