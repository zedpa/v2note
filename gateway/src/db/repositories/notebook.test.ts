import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { findByDevice, findOrCreate, ensureSystemNotebooks } from "./notebook.js";
import { query, queryOne } from "../pool.js";

describe("notebook repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findByDevice", () => {
    it("returns notebooks ordered by system flag", async () => {
      vi.mocked(query).mockResolvedValue([
        { id: "nb-1", name: "ai-self", is_system: true },
        { id: "nb-2", name: "default", is_system: true },
        { id: "nb-3", name: "project-x", is_system: false },
      ] as any);

      const results = await findByDevice("dev-1");
      expect(results).toHaveLength(3);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY is_system DESC"),
        ["dev-1"],
      );
    });
  });

  describe("findOrCreate", () => {
    it("creates new notebook when none exists", async () => {
      const mockNew = {
        id: "nb-new",
        name: "project-alpha",
        device_id: "dev-1",
        is_system: false,
      };
      // 第一次 queryOne: SELECT existing → null
      // 第二次 queryOne: INSERT RETURNING
      vi.mocked(queryOne)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockNew as any);

      const result = await findOrCreate("dev-1", "project-alpha", "Alpha notes");
      expect(result.name).toBe("project-alpha");
      // 第二次调用应该是 INSERT
      const insertSql = vi.mocked(queryOne).mock.calls[1][0];
      expect(insertSql).toContain("INSERT INTO notebook");
    });

    it("returns existing notebook when found", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "nb-existing",
        name: "default",
        is_system: true,
      } as any);

      const result = await findOrCreate("dev-1", "default", "System diary", true);
      expect(result.name).toBe("default");
      // 只应调用一次 SELECT，不调用 INSERT
      expect(queryOne).toHaveBeenCalledTimes(1);
    });
  });

  describe("ensureSystemNotebooks", () => {
    it("creates ai-self and default notebooks", async () => {
      // 每次 findOrCreate: SELECT → existing found（返回已有的）
      vi.mocked(queryOne).mockResolvedValue({ id: "nb-1", name: "system" } as any);

      await ensureSystemNotebooks("dev-1");
      // 两次 findOrCreate，每次先 SELECT（找到则返回），共 2 次 queryOne
      expect(queryOne).toHaveBeenCalled();

      const calls = vi.mocked(queryOne).mock.calls;
      // 第一次 SELECT 查 ai-self
      expect(calls[0][1]).toContain("ai-self");
      // 第二次 SELECT 查 default
      expect(calls[1][1]).toContain("default");
    });
  });
});
