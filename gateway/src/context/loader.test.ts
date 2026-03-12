import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../memory/long-term.js", () => ({
  loadMemory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../soul/manager.js", () => ({
  loadSoul: vi.fn().mockResolvedValue({ content: "Soul content" }),
}));

vi.mock("../profile/manager.js", () => ({
  loadProfile: vi.fn().mockResolvedValue({ content: "Profile content" }),
}));

vi.mock("../db/repositories/index.js", () => ({
  goalRepo: {
    findActiveByDevice: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../lib/text-utils.js", () => ({
  extractKeywords: vi.fn().mockReturnValue(new Set()),
}));

import { loadWarmContext } from "./loader.js";
import { loadProfile } from "../profile/manager.js";
import { loadSoul } from "../soul/manager.js";

describe("context loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadWarmContext", () => {
    it("includes userProfile in returned context", async () => {
      const ctx = await loadWarmContext({
        deviceId: "dev-1",
        mode: "chat",
      });

      expect(ctx.userProfile).toBe("Profile content");
      expect(ctx.soul).toBe("Soul content");
    });

    it("loads profile even in process mode", async () => {
      const ctx = await loadWarmContext({
        deviceId: "dev-1",
        mode: "process",
      });

      expect(loadProfile).toHaveBeenCalledWith("dev-1");
      expect(ctx.userProfile).toBe("Profile content");
      // Soul is skipped in process mode
      expect(ctx.soul).toBeUndefined();
    });

    it("skips soul when localSoul is provided", async () => {
      const ctx = await loadWarmContext({
        deviceId: "dev-1",
        mode: "chat",
        localSoul: "Local soul content",
      });

      expect(loadSoul).not.toHaveBeenCalled();
      expect(ctx.soul).toBe("Local soul content");
    });

    it("handles profile load failure gracefully", async () => {
      vi.mocked(loadProfile).mockRejectedValue(new Error("DB error"));

      const ctx = await loadWarmContext({
        deviceId: "dev-1",
        mode: "chat",
      });

      expect(ctx.userProfile).toBeUndefined();
      // Should not throw
    });
  });
});
