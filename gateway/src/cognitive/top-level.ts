/**
 * 顶层维度生成 — 冷启动后基于 embedding 匹配预设维度库
 *
 * 0 AI 调用，纯 embedding + 关键词匹配
 */

import { strikeRepo } from "../db/repositories/index.js";
import { getEmbedding, cosineSimilarity } from "../memory/embeddings.js";
import type { StrikeEntry } from "../db/repositories/strike.js";

/** 预设维度库（中文常见生活/工作维度） */
const PRESET_DIMENSIONS = [
  { label: "工作", keywords: ["上班", "工作", "公司", "项目", "领导", "同事", "会议", "加班", "出差", "业务"] },
  { label: "学习", keywords: ["学习", "上学", "考试", "读书", "课程", "培训", "技能", "知识"] },
  { label: "创业", keywords: ["创业", "产品", "创始", "融资", "客户", "市场", "商业", "合伙"] },
  { label: "投资", keywords: ["投资", "理财", "股票", "基金", "炒币", "房产", "收益", "风险"] },
  { label: "家庭", keywords: ["家庭", "孩子", "带娃", "父母", "家人", "婚姻", "伴侣"] },
  { label: "健康", keywords: ["健康", "运动", "锻炼", "减肥", "饮食", "睡眠", "医院"] },
  { label: "社交", keywords: ["朋友", "社交", "聚会", "人脉", "关系", "沟通"] },
  { label: "兴趣", keywords: ["爱好", "兴趣", "旅行", "音乐", "电影", "游戏", "写作", "摄影"] },
  { label: "生活", keywords: ["生活", "日常", "购物", "搬家", "租房", "做饭"] },
];

const MATCH_THRESHOLD = 0.6;

/**
 * 从冷启动回答生成个性化顶层维度（L3 Cluster）
 * 使用关键词匹配 + embedding 相似度
 */
export async function generateTopLevelDimensions(
  userId: string,
  answerText: string,
): Promise<StrikeEntry[]> {
  const textLower = answerText.toLowerCase();
  const matched: string[] = [];

  // 关键词匹配
  for (const dim of PRESET_DIMENSIONS) {
    const hits = dim.keywords.filter((k) => textLower.includes(k));
    if (hits.length >= 1) {
      matched.push(dim.label);
    }
  }

  // 确保至少有"生活"维度
  if (!matched.includes("生活")) {
    matched.push("生活");
  }

  // 最多 6 个，最少 2 个
  const finalDims = matched.slice(0, 6);

  // 创建 L3 Cluster
  const results: StrikeEntry[] = [];
  for (const label of finalDims) {
    const entry = await strikeRepo.create({
      user_id: userId,
      nucleus: `[${label}] ${label}相关`,
      polarity: "perceive",
      is_cluster: true,
      confidence: 0.6,
      salience: 0.8,
      source_type: "clustering",
      level: 3,
      origin: "preset",
    });
    results.push(entry);
  }

  console.log(`[top-level] Created ${results.length} dimensions: ${finalDims.join(", ")}`);
  return results;
}

/**
 * 将一个 Strike 的 nucleus 与顶层维度做 embedding 匹配
 * 返回最匹配的顶层，或 null（低于阈值）
 */
export async function matchToTopLevel(
  nucleus: string,
  topLevels: StrikeEntry[],
): Promise<StrikeEntry | null> {
  if (topLevels.length === 0) return null;

  const embedding = await getEmbedding(nucleus);
  if (!embedding || embedding.length === 0) return null;

  let bestMatch: StrikeEntry | null = null;
  let bestScore = 0;

  for (const tl of topLevels) {
    const tlEmbedding = await getEmbedding(tl.nucleus);
    if (!tlEmbedding || tlEmbedding.length === 0) continue;

    const sim = cosineSimilarity(embedding, tlEmbedding);
    if (sim > bestScore && sim > MATCH_THRESHOLD) {
      bestScore = sim;
      bestMatch = tl;
    }
  }

  return bestMatch;
}
