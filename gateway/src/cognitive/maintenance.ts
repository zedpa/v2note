/**
 * Cognitive maintenance — 原 strike/bond 系统的维护逻辑。
 * strike/bond 表已在 migration 064 中删除，所有函数保留签名但改为 no-op。
 */

// ---------------------------------------------------------------------------
// 1. Bond type normalization (no-op: bond 表已删除)
// ---------------------------------------------------------------------------

export async function normalizeBondTypes(_userId: string): Promise<number> {
  return 0;
}

// ---------------------------------------------------------------------------
// 2. Bond strength decay (no-op: bond 表已删除)
// ---------------------------------------------------------------------------

export async function decayBondStrength(_userId: string): Promise<number> {
  return 0;
}

// ---------------------------------------------------------------------------
// 3. Salience decay (no-op: strike 表已删除)
// ---------------------------------------------------------------------------

export async function decaySalience(_userId: string): Promise<number> {
  return 0;
}

// ---------------------------------------------------------------------------
// 4. Salience boost (no-op: strike 表已删除)
// ---------------------------------------------------------------------------

export async function boostSalience(_strikeId: string): Promise<void> {
  // no-op
}
