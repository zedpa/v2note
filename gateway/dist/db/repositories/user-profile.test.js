import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock the pool module
vi.mock("../pool.js", () => ({
    queryOne: vi.fn(),
    execute: vi.fn(),
}));
import { findByDevice, upsert } from "./user-profile.js";
import { queryOne, execute } from "../pool.js";
describe("user-profile repository", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("findByDevice", () => {
        it("returns profile when found", async () => {
            const mockProfile = {
                id: "p-1",
                device_id: "dev-1",
                content: "用户是一名软件工程师",
                updated_at: "2026-03-12T00:00:00Z",
            };
            vi.mocked(queryOne).mockResolvedValue(mockProfile);
            const result = await findByDevice("dev-1");
            expect(result).toEqual(mockProfile);
            expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("user_profile"), ["dev-1"]);
        });
        it("returns null when not found", async () => {
            vi.mocked(queryOne).mockResolvedValue(null);
            const result = await findByDevice("dev-unknown");
            expect(result).toBeNull();
        });
    });
    describe("upsert", () => {
        it("inserts or updates profile", async () => {
            vi.mocked(execute).mockResolvedValue(1);
            await upsert("dev-1", "Updated profile content");
            expect(execute).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT"), ["dev-1", "Updated profile content"]);
        });
    });
});
//# sourceMappingURL=user-profile.test.js.map