/**
 * 批注系统 — 高亮和批注 CRUD。
 *
 * 高亮 → Strike(perceive, highlight)，参与 Bond/Cluster
 * 批注 → record(think) + transcript + Digest 管道
 */

import { query } from "../db/pool.js";
import { strikeRepo, bondRepo, recordRepo, transcriptRepo } from "../db/repositories/index.js";
import { digestRecords } from "../handlers/digest.js";

// ─── 场景 1: 高亮标注 ───

export async function createHighlight(params: {
  userId: string;
  recordId: string;
  text: string;
  span: string;
}): Promise<{ strikeId: string }> {
  const strike = await strikeRepo.create({
    user_id: params.userId,
    nucleus: params.text,
    polarity: "perceive",
    source_type: "highlight",
    source_id: params.recordId,
    source_span: params.span,
  });

  return { strikeId: strike.id };
}

// ─── 场景 2: 批注 ───

export async function createAnnotation(params: {
  userId: string;
  deviceId: string;
  targetRecordId: string;
  text: string;
}): Promise<{ recordId: string }> {
  // 创建 think record
  const record = await recordRepo.create({
    user_id: params.userId,
    device_id: params.deviceId,
    source_type: "think",
  });

  // 存储文本
  await transcriptRepo.create({
    record_id: record.id,
    text: params.text,
    language: "zh",
  });

  // 触发 Digest（异步）
  digestRecords([record.id], {
    deviceId: params.deviceId,
    userId: params.userId,
  }).catch((err: any) => {
    console.warn("[annotation] Digest failed:", err.message);
  });

  return { recordId: record.id };
}

// ─── 场景 3: 素材添加想法 ───

export async function addThoughtToMaterial(params: {
  userId: string;
  deviceId: string;
  materialRecordId: string;
  text: string;
}): Promise<{ recordId: string }> {
  // 创建 think record
  const record = await recordRepo.create({
    user_id: params.userId,
    device_id: params.deviceId,
    source_type: "think",
  });

  await transcriptRepo.create({
    record_id: record.id,
    text: params.text,
    language: "zh",
  });

  // 触发 Digest（异步）
  digestRecords([record.id], {
    deviceId: params.deviceId,
    userId: params.userId,
  }).catch((err: any) => {
    console.warn("[annotation] Digest failed:", err.message);
  });

  return { recordId: record.id };
}

// ─── 场景 4: 管理 ───

export async function listAnnotations(
  recordId: string,
): Promise<Array<{ id: string; nucleus: string; source_type: string; polarity: string; created_at: string }>> {
  return query<{
    id: string;
    nucleus: string;
    source_type: string;
    polarity: string;
    created_at: string;
  }>(
    `SELECT id, nucleus, source_type, polarity, created_at
     FROM strike
     WHERE source_id = $1 AND source_type = 'highlight' AND status = 'active'
     ORDER BY created_at DESC`,
    [recordId],
  );
}

export async function archiveAnnotation(strikeId: string): Promise<void> {
  await strikeRepo.update(strikeId, { status: "archived" });
}
