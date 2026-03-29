/**
 * 顶层维度生成 — 冷启动后基于 embedding 匹配预设维度库
 *
 * 0 AI 调用，纯 embedding + 关键词匹配
 */
import type { StrikeEntry } from "../db/repositories/strike.js";
/**
 * 从冷启动回答生成个性化顶层维度（L3 Cluster）
 * 使用关键词匹配 + embedding 相似度
 */
export declare function generateTopLevelDimensions(userId: string, answerText: string): Promise<StrikeEntry[]>;
/**
 * 将一个 Strike 的 nucleus 与顶层维度做 embedding 匹配
 * 返回最匹配的顶层，或 null（低于阈值）
 */
export declare function matchToTopLevel(nucleus: string, topLevels: StrikeEntry[]): Promise<StrikeEntry | null>;
