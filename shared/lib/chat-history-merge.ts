/**
 * 聊天历史合并（本地 captures kind="chat_user_msg" + 服务端 chat history）
 *
 * regression: fix-cold-resume-silent-loss (Phase 6, spec §3.3)
 *
 * 刷新页面后从 captureStore 恢复未同步 chat_user_msg，合并进聊天列表。
 * 三角桥去重与时间线相同（localId ↔ serverId ↔ client_id）。
 *
 * 与时间线的差异：
 *   - 聊天按时间正序显示（旧 → 新），未同步条目按 createdAt 排在相应时间点
 *   - 注意：本地未同步条目**不置顶**，而是按时间顺序插入（聊天语义：先说的先显示）
 *   - 但若本地时间戳 > 所有服务端时间戳，自然排在最后（= "最新的待同步消息"）
 */

import type { CaptureRecord } from "./capture-store";

export interface ServerChatMessage {
  id: string;
  client_id?: string | null;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  parts?: unknown[];
  [k: string]: unknown;
}

export interface ChatMergedRow {
  id: string;
  /** 本地 localId（若来自本地未同步） */
  localId?: string;
  /** 作为 client_id 透传给下游 */
  client_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  syncStatus: "captured" | "syncing" | "synced" | "failed";
  parts?: unknown[];
  /**
   * C4（§2.4 语音降级）：本地 capture 的 audioLocalId 透传。
   * 服务端行恒为 null；本地行来自 CaptureRecord.audioLocalId。
   * 播放 UI 暂未实现（defer），此处仅保证数据链路不丢。
   */
  audioLocalId?: string | null;
  [k: string]: unknown;
}

export interface ChatMergeCallbacks {
  /** 规则 (b)：ack 丢失恢复 */
  onAckRecovered?: (localId: string, serverId: string) => void | Promise<void>;
}

/** 数值时间戳升序比较。null / NaN 兜底为 0 避免崩溃。 */
function compareAsc(a: string | null | undefined, b: string | null | undefined): number {
  const ta = Date.parse(a ?? "");
  const tb = Date.parse(b ?? "");
  return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
}

export function mergeChatHistory(
  localCaptures: readonly CaptureRecord[],
  serverMessages: readonly ServerChatMessage[],
  callbacks: ChatMergeCallbacks = {},
): ChatMergedRow[] {
  // 只关心 chat_user_msg
  const localChat = localCaptures.filter((c) => c.kind === "chat_user_msg");

  // 服务端索引
  // C1：client_id 使用 trim 后的值，兼容服务端中间件未 trim 干净的场景
  const serverByClientId = new Map<string, ServerChatMessage>();
  const serverById = new Map<string, ServerChatMessage>();
  for (const s of serverMessages) {
    if (typeof s.client_id === "string") {
      const key = s.client_id.trim();
      if (key) serverByClientId.set(key, s);
    }
    if (s.id) serverById.set(s.id, s);
  }

  const consumedLocalIds = new Set<string>();
  // M4：本地 synced 但 serverId 不在当前分页 → 悬空 synced，不置顶
  const danglingSyncedLocalIds = new Set<string>();

  // Phase A：处理本地条目去重逻辑（规则 a/b）
  for (const c of localChat) {
    // 规则 (a)：本地 synced 且 serverId 在服务端 → 服务端优先
    if (c.syncStatus === "synced" && c.serverId && serverById.has(c.serverId)) {
      consumedLocalIds.add(c.localId);
      continue;
    }

    // 规则 (b)：未同步但 client_id 对上 → ack 丢失恢复
    // C1：查询时同样 trim localId
    const matched = serverByClientId.get((c.localId ?? "").trim());
    if (
      matched &&
      (c.syncStatus === "captured" ||
        c.syncStatus === "syncing" ||
        c.syncStatus === "failed")
    ) {
      consumedLocalIds.add(c.localId);
      if (callbacks.onAckRecovered) {
        void Promise.resolve(
          callbacks.onAckRecovered(c.localId, matched.id),
        ).catch(() => {});
      }
      continue;
    }

    // M4：本地 synced 但当前分页中没有该 serverId → 悬空 synced，按 created_at 融入（不强调上移）
    if (c.syncStatus === "synced") {
      danglingSyncedLocalIds.add(c.localId);
    }
  }

  // Phase B：构造合并行
  //   - 服务端全量
  //   - 本地条目：未被 consumed 的 chat_user_msg
  const rows: ChatMergedRow[] = [];

  for (const s of serverMessages) {
    // M7：服务端行缺 id → 跳过，避免 React key=undefined
    if (!s.id) continue;
    rows.push({
      ...(s as object),
      id: s.id,
      role: s.role,
      content: s.content,
      created_at: s.created_at,
      syncStatus: "synced",
      parts: s.parts,
      client_id: s.client_id ?? undefined,
      audioLocalId: null,
    });
  }

  for (const c of localChat) {
    if (consumedLocalIds.has(c.localId)) continue;
    rows.push({
      id: c.localId,
      localId: c.localId,
      client_id: c.localId,
      role: "user",
      content: c.text ?? "",
      created_at: c.createdAt,
      syncStatus: c.syncStatus,
      // C4（§2.4 语音降级）：透传 audioLocalId，UI 播放回放留待后续 phase
      audioLocalId: c.audioLocalId,
      // M4：悬空 synced 行也要渲染（保持时间顺序），状态已经由 syncStatus 表达
      _dangling: danglingSyncedLocalIds.has(c.localId) || undefined,
    });
  }

  // 按 created_at 升序（聊天时间正序）
  // C2：数值比较 + NaN 兜底，避免 created_at 为 null 时 localeCompare 抛 TypeError
  // M3：同时修复 ISO tz offset 字典序错排
  rows.sort((a, b) => compareAsc(a.created_at, b.created_at));

  return rows;
}
