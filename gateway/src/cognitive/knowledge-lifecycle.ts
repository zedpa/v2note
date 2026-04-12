/**
 * 知识生命周期管理
 * 原基于 strike 表的过期事实检测/supersede 逻辑。
 * strike 表已在 migration 064 中删除，所有函数保留签名但改为 no-op。
 * 未来可基于 wiki_page 重建知识生命周期管理。
 */

// ── 场景 1: 过期事实检测 (no-op) ────────────────────────────────────────

export interface ExpiredFact {
  oldId: string;
  oldNucleus: string;
  newId: string;
  newNucleus: string;
  similarity: number;
}

export async function scanExpiredFacts(_userId: string): Promise<ExpiredFact[]> {
  return [];
}

// ── 过期确认 alert (no-op) ──────────────────────────────────────────────

export interface SupersedeAlert {
  type: "superseded";
  strikeId: string;
  nucleus: string;
  supersededBy: string;
  newNucleus: string;
  description: string;
}

export async function getSupersedAlerts(_userId: string): Promise<SupersedeAlert[]> {
  return [];
}

// ── 场景 3: 撤销 supersede (no-op) ──────────────────────────────────────

export async function undoSupersede(_strikeId: string): Promise<void> {
  // no-op
}
