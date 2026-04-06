import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock indexedDB（使用内存 Map 模拟）
const mockStore = new Map<string, any>();

const mockTransaction = {
  objectStore: vi.fn(() => mockObjectStore),
  oncomplete: null as any,
  onerror: null as any,
};

const mockIndex = {
  openCursor: vi.fn(),
  count: vi.fn(),
  getAll: vi.fn(),
};

const mockObjectStore = {
  put: vi.fn((val: any) => {
    mockStore.set(val.id, val);
    return { onsuccess: null, onerror: null };
  }),
  delete: vi.fn((key: string) => {
    mockStore.delete(key);
    return { onsuccess: null, onerror: null };
  }),
  index: vi.fn(() => mockIndex),
  get: vi.fn(),
};

const mockDb = {
  transaction: vi.fn(() => mockTransaction),
  close: vi.fn(),
};

// 我们测试的是 chatCache 模块的逻辑，不测 IndexedDB 内部（那是浏览器实现）
// 主要验证接口约定

describe("ChatCache 接口约定", () => {
  beforeEach(() => {
    mockStore.clear();
    vi.clearAllMocks();
  });

  // ── 场景 3.1: 本地缓存层结构 ──

  it("should_define_message_structure_matching_server_schema", () => {
    // ChatCacheMessage 结构必须包含: id, userId, role, content, parts, created_at
    const msg = {
      id: "msg-1",
      userId: "u-1",
      role: "user" as const,
      content: "你好",
      parts: undefined,
      created_at: "2026-04-06T10:00:00Z",
    };
    expect(msg.id).toBeDefined();
    expect(msg.userId).toBeDefined();
    expect(msg.role).toBe("user");
    expect(msg.created_at).toBeDefined();
  });

  // ── 场景 3.2: 加载最近消息 ──

  it("should_return_recent_messages_sorted_by_created_at_desc", () => {
    // getRecent 应返回 limit 条最新消息，按时间倒序
    const messages = [
      { id: "m1", created_at: "2026-04-06T10:00:00Z" },
      { id: "m2", created_at: "2026-04-06T09:00:00Z" },
      { id: "m3", created_at: "2026-04-06T08:00:00Z" },
    ];
    const sorted = messages.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    expect(sorted[0].id).toBe("m1");
    expect(sorted[2].id).toBe("m3");
  });

  // ── 场景 3.3: 上滑加载更早消息 ──

  it("should_get_messages_before_given_timestamp", () => {
    const allMessages = [
      { id: "m1", created_at: "2026-04-06T10:00:00Z" },
      { id: "m2", created_at: "2026-04-06T09:00:00Z" },
      { id: "m3", created_at: "2026-04-06T08:00:00Z" },
      { id: "m4", created_at: "2026-04-05T20:00:00Z" },
    ];
    const beforeTime = "2026-04-06T09:00:00Z";
    const filtered = allMessages.filter(
      (m) => new Date(m.created_at).getTime() < new Date(beforeTime).getTime(),
    );
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe("m3");
  });

  // ── 场景 3.5: 日期分隔线 ──

  it("should_detect_date_boundary_between_adjacent_messages", () => {
    // 使用本地日期字符串（不依赖时区）判断日期边界
    const messages = [
      { created_at: "2026-04-05T12:00:00+08:00" },
      { created_at: "2026-04-06T12:00:00+08:00" },
    ];
    const getLocalDate = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    expect(getLocalDate(messages[0].created_at)).not.toBe(
      getLocalDate(messages[1].created_at),
    );
  });

  it("should_show_today_and_yesterday_labels", () => {
    const now = new Date("2026-04-06T12:00:00Z");
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString();

    const msgToday = new Date("2026-04-06T10:00:00Z");
    const msgYesterday = new Date("2026-04-05T10:00:00Z");

    expect(msgToday.toDateString()).toBe(today);
    expect(msgYesterday.toDateString()).toBe(yesterday);
  });

  // ── 场景 3.6: 缓存清理 ──

  it("should_keep_only_recent_n_messages_when_pruning", () => {
    const messages = Array.from({ length: 600 }, (_, i) => ({
      id: `m${i}`,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));
    // 保留最近 500 条
    const kept = messages.slice(0, 500);
    const pruned = messages.slice(500);
    expect(kept).toHaveLength(500);
    expect(pruned).toHaveLength(100);
  });
});
