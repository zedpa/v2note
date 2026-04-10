/**
 * record repository — compile_status / content_hash 扩展测试
 * regression: cognitive-wiki Phase 1
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../pool.js", () => ({
    query: vi.fn(),
    queryOne: vi.fn(),
    execute: vi.fn(),
}));
import { findPendingCompile, updateCompileStatus } from "./record.js";
import { query, execute } from "../pool.js";
describe("record repository — compile_status 扩展", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("findPendingCompile", () => {
        it("should_query_pending_and_needs_recompile_records_when_called", async () => {
            const mockRecords = [
                { id: "rec-1", compile_status: "pending", content_hash: null },
                { id: "rec-2", compile_status: "needs_recompile", content_hash: "abc123" },
            ];
            vi.mocked(query).mockResolvedValue(mockRecords);
            const result = await findPendingCompile("u-1");
            expect(result).toHaveLength(2);
            const sql = vi.mocked(query).mock.calls[0][0];
            expect(sql).toContain("compile_status IN ('pending', 'needs_recompile')");
            expect(sql).toContain("user_id = $1");
            expect(sql).toContain("status = 'completed'");
            expect(sql).toContain("ORDER BY created_at ASC");
        });
        it("should_return_empty_array_when_no_pending_records", async () => {
            vi.mocked(query).mockResolvedValue([]);
            const result = await findPendingCompile("u-1");
            expect(result).toEqual([]);
        });
    });
    describe("updateCompileStatus", () => {
        it("should_update_status_only_when_no_content_hash_provided", async () => {
            vi.mocked(execute).mockResolvedValue(1);
            await updateCompileStatus("rec-1", "compiled");
            const sql = vi.mocked(execute).mock.calls[0][0];
            expect(sql).toContain("compile_status = $1");
            expect(sql).toContain("updated_at = now()");
            expect(sql).not.toContain("content_hash");
            expect(vi.mocked(execute).mock.calls[0][1]).toEqual(["compiled", "rec-1"]);
        });
        it("should_update_status_and_content_hash_when_hash_provided", async () => {
            vi.mocked(execute).mockResolvedValue(1);
            await updateCompileStatus("rec-1", "compiled", "sha256abc");
            const sql = vi.mocked(execute).mock.calls[0][0];
            expect(sql).toContain("compile_status = $1");
            expect(sql).toContain("content_hash = $2");
            expect(sql).toContain("updated_at = now()");
            expect(vi.mocked(execute).mock.calls[0][1]).toEqual(["compiled", "sha256abc", "rec-1"]);
        });
        it("should_support_needs_recompile_status", async () => {
            vi.mocked(execute).mockResolvedValue(1);
            await updateCompileStatus("rec-1", "needs_recompile");
            const params = vi.mocked(execute).mock.calls[0][1];
            expect(params[0]).toBe("needs_recompile");
        });
        it("should_support_skipped_status", async () => {
            vi.mocked(execute).mockResolvedValue(1);
            await updateCompileStatus("rec-1", "skipped");
            const params = vi.mocked(execute).mock.calls[0][1];
            expect(params[0]).toBe("skipped");
        });
    });
});
//# sourceMappingURL=record-compile.test.js.map