import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../ai/provider.js", () => ({
  chatCompletion: vi.fn().mockResolvedValue({ content: "Updated profile content" }),
}));

vi.mock("../db/repositories/index.js", () => ({
  userProfileRepo: {
    findByDevice: vi.fn(),
    upsert: vi.fn(),
  },
}));

import { loadProfile, updateProfile } from "./manager.js";
import { userProfileRepo } from "../db/repositories/index.js";
import { chatCompletion } from "../ai/provider.js";

describe("profile manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadProfile", () => {
    it("returns profile when found", async () => {
      const mockProfile = { device_id: "dev-1", content: "Engineer", updated_at: "" };
      vi.mocked(userProfileRepo.findByDevice).mockResolvedValue(mockProfile as any);

      const result = await loadProfile("dev-1");
      expect(result).toEqual(mockProfile);
    });

    it("returns null when not found", async () => {
      vi.mocked(userProfileRepo.findByDevice).mockResolvedValue(null);
      const result = await loadProfile("dev-unknown");
      expect(result).toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("extracts user facts from interaction and saves", async () => {
      vi.mocked(userProfileRepo.findByDevice).mockResolvedValue(null);

      await updateProfile("dev-1", "我是一名前端工程师，喜欢React");

      expect(chatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("用户画像"),
          }),
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("前端工程师"),
          }),
        ]),
        expect.any(Object),
      );
      expect(userProfileRepo.upsert).toHaveBeenCalledWith(
        "dev-1",
        "Updated profile content",
      );
    });

    it("includes existing profile in the prompt", async () => {
      vi.mocked(userProfileRepo.findByDevice).mockResolvedValue({
        content: "Existing profile data",
      } as any);

      await updateProfile("dev-1", "New interaction");

      const userMsg = vi.mocked(chatCompletion).mock.calls[0][0][1];
      expect(userMsg.content).toContain("Existing profile data");
    });
  });
});
