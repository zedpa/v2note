/**
 * 时间线合并（本地 captures + 服务端 records）
 *
 * regression: fix-cold-resume-silent-loss (Phase 6, spec §1.2)
 *
 * 三角桥去重规则（严格按 spec）：
 *   (a) 本地 synced 且 serverId 匹配到服务端行 → 用服务端版本
 *   (b) 本地 captured/syncing/failed 但 client_id 匹配服务端行的 client_id →
 *       判定为"ack 丢失的成功"，调用 onAckRecovered 升级本地为 synced + 回写 serverId，
 *       然后使用服务端版本
 *   (c) 纯本地未同步 → 按 createdAt 插入，**始终置顶**（不参与服务端分页）
 *   (d) 纯服务端 → 正常渲染
 *
 * 降级：服务端失败 → 调用方只传本地条目也能渲染。
 *
 * 过滤：只合入 kind === "diary" 的本地条目（chat/todo 不走时间线）。
 */

import type { CaptureRecord } from "./capture-store";

export interface ServerRecord {
  id: string;
  client_id?: string | null;
  created_at?: string | null;
  // 其他字段透传（content/source/tags/...）
  [k: string]: unknown;
}

/**
 * 时间线合并后的行。
 *   - 服务端行：_localStatus = "synced"（从服务端直读），不带 _local 字段
 *   - 本地行：_localStatus = 本地 syncStatus，带 _local 原始 capture
 */
export interface TimelineRow {
  id: string;
  created_at: string | null;
  _localStatus: "captured" | "syncing" | "synced" | "failed";
  _local?: CaptureRecord;
  /** 其他服务端字段（若来自服务端） */
  [k: string]: unknown;
}

export interface MergeCallbacks {
  /**
   * 规则 (b)：ack 丢失恢复时调用，升级本地记录为 synced + 回写 serverId。
   * 调用方通常注入 captureStore.update。
   */
  onAckRecovered?: (localId: string, serverId: string) => void | Promise<void>;
}

/** 数值时间戳比较（降序：新→旧）。NaN 视作 0，避免整体排序崩溃。 */
function compareDesc(a: string | null | undefined, b: string | null | undefined): number {
  const ta = Date.parse(a ?? "");
  const tb = Date.parse(b ?? "");
  return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
}

/**
 * 将本地 captures 中 kind="diary" 的条目与服务端 records 合并。
 *
 * - 本地未同步条目按 createdAt 降序置顶
 * - 服务端条目接在本地未同步条目下面，保持服务端返回顺序
 *
 * 注意：不修改入参数组；所有变更通过 callbacks 异步回调。
 */
export function mergeTimeline(
  localCaptures: readonly CaptureRecord[],
  serverRecords: readonly ServerRecord[],
  callbacks: MergeCallbacks = {},
): TimelineRow[] {
  // 只关心 diary 类型的本地条目
  const localDiary = localCaptures.filter((c) => c.kind === "diary");

  // 建索引：按 client_id（= localId）和 serverId 分别索引
  // C1：client_id 使用 trim 后的值，兼容服务端中间件未 trim 干净的场景
  const serverByClientId = new Map<string, ServerRecord>();
  const serverById = new Map<string, ServerRecord>();
  for (const s of serverRecords) {
    if (typeof s.client_id === "string") {
      const key = s.client_id.trim();
      if (key) serverByClientId.set(key, s);
    }
    if (s.id) serverById.set(s.id, s);
  }

  // Phase A：处理本地条目
  const localRows: TimelineRow[] = [];
  // M4：本地 synced 但当前分页里没有服务端行 → 悬空 synced，不置顶，按 createdAt 融入 serverRows
  const danglingSynced: TimelineRow[] = [];
  for (const c of localDiary) {
    // 规则 (a)：本地 synced 且 serverId 可在服务端找到 → 用服务端版本
    if (c.syncStatus === "synced" && c.serverId && serverById.has(c.serverId)) {
      // 服务端版本会在 Phase B 以 server row 形态加入，这里跳过本地
      continue;
    }

    // 规则 (b)：未同步但 client_id 匹配到服务端 → ack 丢失恢复
    // C1：查询时同样 trim localId
    const matchedByClient = serverByClientId.get((c.localId ?? "").trim());
    if (
      matchedByClient &&
      (c.syncStatus === "captured" ||
        c.syncStatus === "syncing" ||
        c.syncStatus === "failed")
    ) {
      // 异步升级本地状态；不 await，不阻塞渲染
      if (callbacks.onAckRecovered) {
        void Promise.resolve(
          callbacks.onAckRecovered(c.localId, matchedByClient.id),
        ).catch(() => {
          // 吞掉异常（update 失败不影响本轮渲染）
        });
      }
      // 本次渲染直接用服务端版本（跳过本地）
      continue;
    }

    // M4：本地 synced 但 serverId 不在当前服务端分页 → 悬空 synced，不置顶
    if (c.syncStatus === "synced") {
      danglingSynced.push({
        id: c.localId,
        created_at: c.createdAt,
        _localStatus: "synced",
        _local: c,
      });
      continue;
    }

    // 规则 (c)：纯本地未同步 → 插入（置顶在 Phase C 排序时处理）
    localRows.push({
      id: c.localId,
      created_at: c.createdAt,
      _localStatus: c.syncStatus,
      _local: c,
    });
  }

  // Phase B：处理服务端条目（规则 a/b/d）
  const serverRows: TimelineRow[] = [];
  for (const s of serverRecords) {
    // M7：服务端行缺 id → 跳过，避免 React key=undefined
    if (!s.id) continue;
    serverRows.push({
      ...(s as object),
      id: s.id,
      created_at: s.created_at ?? null,
      _localStatus: "synced",
    });
  }

  // Phase C：排序——本地未同步置顶（createdAt desc 数值比较），
  // 悬空 synced 按 createdAt 融入服务端序列，服务端序列再一起按 createdAt desc 排。
  // M3：数值比较替代字典序，修复 ISO tz offset 混用时的错排
  localRows.sort((a, b) => compareDesc(a.created_at, b.created_at));

  const merged: TimelineRow[] = [...serverRows, ...danglingSynced];
  if (danglingSynced.length > 0) {
    merged.sort((a, b) => compareDesc(a.created_at, b.created_at));
  }

  return [...localRows, ...merged];
}
