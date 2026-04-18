/**
 * record repository — client_id 幂等扩展
 * regression: fix-cold-resume-silent-loss
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import { create, findByClientId } from "./record.js";
import { query, queryOne } from "../pool.js";

describe("records client_id idempotency", () => {
  // regression: fix-cold-resume-silent-loss
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create with client_id", () => {
    it("should_persist_client_id_when_provided", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "rec-1",
        client_id: "local-uuid-1",
      } as any);

      await create({
        user_id: "u-1",
        client_id: "local-uuid-1",
        source: "manual",
      });

      // 验证 client_id 出现在 SQL 字段列表与参数中
      const sql = vi.mocked(queryOne).mock.calls[0][0] as string;
      const params = vi.mocked(queryOne).mock.calls[0][1] as any[];
      expect(sql).toContain("client_id");
      expect(params).toContain("local-uuid-1");
    });

    it("should_default_client_id_to_null_when_omitted", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "rec-2" } as any);

      await create({ user_id: "u-1", source: "manual" });

      const sql = vi.mocked(queryOne).mock.calls[0][0] as string;
      const params = vi.mocked(queryOne).mock.calls[0][1] as any[];
      // 即使未传 client_id，列也应该在 INSERT 中，值为 null（向后兼容）
      expect(sql).toContain("client_id");
      expect(params).toContain(null);
    });
  });

  describe("findByClientId", () => {
    it("should_return_record_when_user_id_and_client_id_match", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "rec-1",
        user_id: "u-1",
        client_id: "local-uuid-1",
      } as any);

      const result = await findByClientId("u-1", "local-uuid-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("rec-1");

      const sql = vi.mocked(queryOne).mock.calls[0][0] as string;
      const params = vi.mocked(queryOne).mock.calls[0][1] as any[];
      expect(sql).toContain("user_id = $1");
      expect(sql).toContain("client_id = $2");
      expect(params).toEqual(["u-1", "local-uuid-1"]);
    });

    it("should_return_null_when_no_matching_row", async () => {
      vi.mocked(queryOne).mockResolvedValue(null);

      const result = await findByClientId("u-1", "missing");
      expect(result).toBeNull();
    });
  });
});
