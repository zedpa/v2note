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
    it("creates new notebook on first call", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "nb-new",
        name: "project-alpha",
        device_id: "dev-1",
        is_system: false,
      } as any);

      const result = await findOrCreate("dev-1", "project-alpha", "Alpha notes");
      expect(result.name).toBe("project-alpha");
      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT"),
        ["dev-1", "project-alpha", "Alpha notes", false],
      );
    });

    it("returns existing notebook on conflict", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "nb-existing",
        name: "default",
        is_system: true,
      } as any);

      const result = await findOrCreate("dev-1", "default", "System diary", true);
      expect(result.name).toBe("default");
    });
  });

  describe("ensureSystemNotebooks", () => {
    it("creates ai-self and default notebooks", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "nb-1", name: "system" } as any);

      await ensureSystemNotebooks("dev-1");
      expect(queryOne).toHaveBeenCalledTimes(2);

      const calls = vi.mocked(queryOne).mock.calls;
      expect(calls[0][1]).toContain("ai-self");
      expect(calls[1][1]).toContain("default");
    });
  });
});
