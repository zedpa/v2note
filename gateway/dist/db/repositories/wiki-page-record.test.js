import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../pool.js", () => ({
    query: vi.fn(),
    execute: vi.fn(),
}));
import { link, unlink, findRecordsByPage, findPagesByRecord, countByPage, } from "./wiki-page-record.js";
import { query, execute } from "../pool.js";
describe("wiki-page-record repository", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("link", () => {
        it("should_insert_association_when_linking_page_and_record", async () => {
            vi.mocked(execute).mockResolvedValue(1);
            await link("wp-1", "rec-1");
            const sql = vi.mocked(execute).mock.calls[0][0];
            expect(sql).toContain("INSERT INTO wiki_page_record");
            expect(sql).toContain("ON CONFLICT");
            expect(sql).toContain("DO NOTHING");
            expect(vi.mocked(execute).mock.calls[0][1]).toEqual(["wp-1", "rec-1"]);
        });
        it("should_not_fail_when_link_already_exists", async () => {
            // ON CONFLICT DO NOTHING 意味着重复 link 不报错
            vi.mocked(execute).mockResolvedValue(0);
            await expect(link("wp-1", "rec-1")).resolves.toBeUndefined();
        });
    });
    describe("unlink", () => {
        it("should_delete_association_when_unlinking", async () => {
            vi.mocked(execute).mockResolvedValue(1);
            await unlink("wp-1", "rec-1");
            const sql = vi.mocked(execute).mock.calls[0][0];
            expect(sql).toContain("DELETE FROM wiki_page_record");
            expect(sql).toContain("wiki_page_id = $1");
            expect(sql).toContain("record_id = $2");
            expect(vi.mocked(execute).mock.calls[0][1]).toEqual(["wp-1", "rec-1"]);
        });
    });
    describe("findRecordsByPage", () => {
        it("should_return_records_for_page_ordered_by_added_at", async () => {
            const mockRecords = [
                { wiki_page_id: "wp-1", record_id: "rec-1", added_at: "2026-04-09T10:00:00Z" },
                { wiki_page_id: "wp-1", record_id: "rec-2", added_at: "2026-04-09T11:00:00Z" },
            ];
            vi.mocked(query).mockResolvedValue(mockRecords);
            const result = await findRecordsByPage("wp-1");
            expect(result).toHaveLength(2);
            const sql = vi.mocked(query).mock.calls[0][0];
            expect(sql).toContain("wiki_page_id = $1");
            expect(sql).toContain("ORDER BY added_at ASC");
            expect(vi.mocked(query).mock.calls[0][1]).toEqual(["wp-1"]);
        });
        it("should_return_empty_array_when_page_has_no_records", async () => {
            vi.mocked(query).mockResolvedValue([]);
            const result = await findRecordsByPage("wp-empty");
            expect(result).toEqual([]);
        });
    });
    describe("findPagesByRecord", () => {
        it("should_return_pages_for_record_ordered_by_added_at", async () => {
            const mockPages = [
                { wiki_page_id: "wp-1", record_id: "rec-1", added_at: "2026-04-09T10:00:00Z" },
                { wiki_page_id: "wp-2", record_id: "rec-1", added_at: "2026-04-09T11:00:00Z" },
            ];
            vi.mocked(query).mockResolvedValue(mockPages);
            const result = await findPagesByRecord("rec-1");
            expect(result).toHaveLength(2);
            const sql = vi.mocked(query).mock.calls[0][0];
            expect(sql).toContain("record_id = $1");
            expect(sql).toContain("ORDER BY added_at ASC");
            expect(vi.mocked(query).mock.calls[0][1]).toEqual(["rec-1"]);
        });
    });
    describe("countByPage", () => {
        it("should_return_count_when_page_has_records", async () => {
            vi.mocked(query).mockResolvedValue([{ count: "5" }]);
            const count = await countByPage("wp-1");
            expect(count).toBe(5);
            const sql = vi.mocked(query).mock.calls[0][0];
            expect(sql).toContain("COUNT(*)");
            expect(sql).toContain("wiki_page_id = $1");
        });
        it("should_return_zero_when_page_has_no_records", async () => {
            vi.mocked(query).mockResolvedValue([{ count: "0" }]);
            const count = await countByPage("wp-empty");
            expect(count).toBe(0);
        });
    });
});
//# sourceMappingURL=wiki-page-record.test.js.map