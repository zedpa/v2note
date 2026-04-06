import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/repositories/index.js", () => ({
  recordRepo: {
    findById: vi.fn(),
    updateDomain: vi.fn(),
    listUserDomains: vi.fn(),
    listUserDomainsWithCount: vi.fn(),
    countUncategorized: vi.fn(),
    batchUpdateDomain: vi.fn(),
    clearDomainByPrefix: vi.fn(),
  },
}));

import { listFoldersTool } from "./list-folders.js";
import { moveRecordTool } from "./move-record.js";
import { manageFolderTool } from "./manage-folder.js";
import { recordRepo } from "../../db/repositories/index.js";

const CTX = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };

describe("list_folders", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_return_folders_with_counts_when_user_has_folders", async () => {
    vi.mocked(recordRepo.listUserDomainsWithCount).mockResolvedValue([
      { domain: "工作", count: 15 },
      { domain: "生活", count: 8 },
    ]);
    vi.mocked(recordRepo.countUncategorized).mockResolvedValue(3);

    const result = await listFoldersTool.handler({}, CTX);

    expect(result.success).toBe(true);
    expect(result.data!.folders).toHaveLength(2);
    expect(result.data!.uncategorized_count).toBe(3);
  });

  it("should_return_empty_when_no_folders", async () => {
    vi.mocked(recordRepo.listUserDomainsWithCount).mockResolvedValue([]);
    vi.mocked(recordRepo.countUncategorized).mockResolvedValue(5);

    const result = await listFoldersTool.handler({}, CTX);

    expect(result.success).toBe(true);
    expect(result.data!.folders).toHaveLength(0);
    expect(result.data!.uncategorized_count).toBe(5);
  });

  it("should_have_silent_autonomy", () => {
    expect(listFoldersTool.autonomy).toBe("silent");
  });
});

describe("move_record", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_move_record_to_new_domain_when_valid", async () => {
    vi.mocked(recordRepo.findById).mockResolvedValue({
      id: "rec-1", device_id: "dev-1", user_id: "user-1", domain: "生活",
    } as any);

    const result = await moveRecordTool.handler(
      { record_id: "rec-1", domain: "工作/v2note" },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(recordRepo.updateDomain).toHaveBeenCalledWith("rec-1", "工作/v2note");
    expect(result.data!.old_domain).toBe("生活");
    expect(result.data!.new_domain).toBe("工作/v2note");
  });

  it("should_move_to_uncategorized_when_domain_is_null", async () => {
    vi.mocked(recordRepo.findById).mockResolvedValue({
      id: "rec-1", device_id: "dev-1", user_id: "user-1", domain: "工作",
    } as any);

    const result = await moveRecordTool.handler(
      { record_id: "rec-1", domain: null },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(recordRepo.updateDomain).toHaveBeenCalledWith("rec-1", null);
    expect(result.message).toContain("未分类");
  });

  it("should_fail_when_record_not_found", async () => {
    vi.mocked(recordRepo.findById).mockResolvedValue(null);

    const result = await moveRecordTool.handler(
      { record_id: "nonexistent", domain: "工作" },
      CTX,
    );

    expect(result.success).toBe(false);
  });

  it("should_fail_when_no_access", async () => {
    vi.mocked(recordRepo.findById).mockResolvedValue({
      id: "rec-2", device_id: "other-dev", user_id: "other-user",
    } as any);

    const result = await moveRecordTool.handler(
      { record_id: "rec-2", domain: "工作" },
      CTX,
    );

    expect(result.success).toBe(false);
  });

  it("should_have_notify_autonomy", () => {
    expect(moveRecordTool.autonomy).toBe("notify");
  });
});

describe("manage_folder", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── create ──
  it("should_create_folder_when_name_not_exists", async () => {
    vi.mocked(recordRepo.listUserDomains).mockResolvedValue(["工作", "生活"]);

    const result = await manageFolderTool.handler(
      { action: "create", name: "旅行" },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("旅行");
  });

  it("should_fail_create_when_name_already_exists", async () => {
    vi.mocked(recordRepo.listUserDomains).mockResolvedValue(["工作", "旅行"]);

    const result = await manageFolderTool.handler(
      { action: "create", name: "旅行" },
      CTX,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("已存在");
  });

  it("should_fail_create_when_no_name", async () => {
    const result = await manageFolderTool.handler(
      { action: "create" },
      CTX,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("name");
  });

  // ── rename ──
  it("should_rename_folder_and_update_records", async () => {
    vi.mocked(recordRepo.batchUpdateDomain).mockResolvedValue(12);

    const result = await manageFolderTool.handler(
      { action: "rename", old_name: "杂项", new_name: "其他" },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(recordRepo.batchUpdateDomain).toHaveBeenCalledWith("user-1", "杂项", "其他");
    expect(result.data!.affected_count).toBe(12);
  });

  it("should_fail_rename_when_missing_params", async () => {
    const result = await manageFolderTool.handler(
      { action: "rename", old_name: "杂项" },
      CTX,
    );

    expect(result.success).toBe(false);
  });

  // ── delete ──
  it("should_delete_folder_and_clear_domain", async () => {
    vi.mocked(recordRepo.clearDomainByPrefix).mockResolvedValue(8);

    const result = await manageFolderTool.handler(
      { action: "delete", name: "杂项" },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(recordRepo.clearDomainByPrefix).toHaveBeenCalledWith("user-1", "杂项");
    expect(result.data!.affected_count).toBe(8);
  });

  it("should_fail_delete_when_no_name", async () => {
    const result = await manageFolderTool.handler(
      { action: "delete" },
      CTX,
    );

    expect(result.success).toBe(false);
  });

  // ── merge ──
  it("should_merge_source_into_target", async () => {
    vi.mocked(recordRepo.batchUpdateDomain).mockResolvedValue(5);

    const result = await manageFolderTool.handler(
      { action: "merge", source: "工作/杂项", target: "工作" },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(recordRepo.batchUpdateDomain).toHaveBeenCalledWith("user-1", "工作/杂项", "工作");
    expect(result.data!.affected_count).toBe(5);
  });

  it("should_fail_merge_when_missing_params", async () => {
    const result = await manageFolderTool.handler(
      { action: "merge", source: "工作/杂项" },
      CTX,
    );

    expect(result.success).toBe(false);
  });

  it("should_have_confirm_autonomy", () => {
    expect(manageFolderTool.autonomy).toBe("confirm");
  });
});
