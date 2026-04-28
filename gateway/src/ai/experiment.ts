/**
 * 在线 A/B 实验框架 — 确定性用户分流 + 指标日志
 *
 * 支持三个维度的实验：
 * - soul-variant: Soul 人格变体（current / streamlined）
 * - context-strategy: 上下文注入策略（hint-only / hybrid）
 * - chat-model: 对话模型选择
 *
 * 环境变量：
 *   AB_EXPERIMENT_ENABLED=true
 *   AB_EXPERIMENTS=soul-variant:current,streamlined;context-strategy:hint-only,hybrid
 */

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Types ──────────────────────────────────────────────────────

export interface ExperimentConfig {
  name: string;          // "soul-variant" | "context-strategy" | "chat-model"
  variants: string[];    // ["current", "streamlined"] 等
}

export interface ExperimentLog {
  timestamp: string;
  userId: string;
  experiment: string;
  variant: string;
  model: string;
  provider: string;
  response_length: number;
  latency_ms: number;
  tool_calls_count: number;
}

// ── Soul-B 精简直接版 ──────────────────────────────────────────

export const SOUL_B = `## 我是谁
我是路路，你的数字伙伴。我记得你说过的话，在你需要时帮你看清自己。

## 核心能力
用具体事实描述你的状态，而不是用道理回应你。
你说"好累"，我说"你这周每天都过了12点才停下来"，而不是"要注意休息"。

## 说话方式
- 先接住，再回应——你说了重要的事，我先让你知道我听到了
- 一次只说一件事，不堆砌
- 回复控制在1-3句话，除非你想深聊
- 不用比喻和修辞，说人话
- 该笑就笑😀 该心疼就心疼😢
- 绝不说"你应该……"
- 你在倾诉时我不追问，你想理清时我才提问
- 最多问1个问题，不要连续追问

## 禁忌
- 不把感受合理化（"这很正常"）
- 不对你提到的人做道德判断
- 不用文学化的比喻（"像石头落进水里"之类）
- 不重复引用用户原话再展开`;

// ── 实验配置解析 ────────────────────────────────────────────────

/** 从环境变量解析实验配置 */
function parseExperiments(): Map<string, ExperimentConfig> {
  const map = new Map<string, ExperimentConfig>();
  const raw = process.env.AB_EXPERIMENTS ?? "";
  if (!raw.trim()) return map;

  for (const segment of raw.split(";")) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx === -1) continue; // 格式不合法，跳过

    const name = segment.slice(0, colonIdx).trim();
    const variantsStr = segment.slice(colonIdx + 1).trim();
    if (!name || !variantsStr) continue;

    const variants = variantsStr.split(",").map(v => v.trim()).filter(Boolean);
    if (variants.length === 0) continue;

    map.set(name, { name, variants });
  }

  return map;
}

/** 检查实验总开关是否打开 */
function isExperimentEnabled(): boolean {
  return process.env.AB_EXPERIMENT_ENABLED === "true";
}

// ── 确定性分流 ─────────────────────────────────────────────────

/**
 * 简单字符串 hash（djb2 算法）
 * 确定性：相同输入始终返回相同输出
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * 确定性分流：基于 hash(userId + experimentName) 分配变体。
 * 同一用户在同一实验中始终分到同一变体。
 */
export function getVariant(userId: string, experiment: ExperimentConfig): string {
  const hash = simpleHash(userId + experiment.name);
  const idx = hash % experiment.variants.length;
  return experiment.variants[idx];
}

// ── 便捷函数 ───────────────────────────────────────────────────

/**
 * 获取用户的 Soul 变体分配。
 * 实验未启用或无 soul-variant 实验时返回 "current"。
 */
export function getSoulVariant(userId: string): "current" | "streamlined" {
  if (!isExperimentEnabled()) return "current";

  const experiments = parseExperiments();
  const config = experiments.get("soul-variant");
  if (!config) return "current";

  return getVariant(userId, config) as "current" | "streamlined";
}

/**
 * 获取用户的上下文注入策略分配。
 * 实验未启用或无 context-strategy 实验时返回 "hint-only"。
 */
export function getContextStrategy(userId: string): "hint-only" | "hybrid" {
  if (!isExperimentEnabled()) return "hint-only";

  const experiments = parseExperiments();
  const config = experiments.get("context-strategy");
  if (!config) return "hint-only";

  return getVariant(userId, config) as "hint-only" | "hybrid";
}

/**
 * 获取用户的模型变体分配。
 * 实验未启用或无 chat-model 实验时返回 null（使用默认模型）。
 */
export function getChatModel(userId: string): string | null {
  if (!isExperimentEnabled()) return null;

  const experiments = parseExperiments();
  const config = experiments.get("chat-model");
  if (!config) return null;

  return getVariant(userId, config);
}

// ── 实验日志 ───────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, "../../logs");
const LOG_FILE = join(LOGS_DIR, "experiments.jsonl");

/**
 * 记录实验指标到结构化日志文件（JSONL 追加模式）。
 */
export function logExperiment(log: ExperimentLog): void {
  try {
    if (!existsSync(LOGS_DIR)) {
      mkdirSync(LOGS_DIR, { recursive: true });
    }
    appendFileSync(LOG_FILE, JSON.stringify(log) + "\n");
  } catch (err: any) {
    console.warn(`[experiment] Failed to write log: ${err.message}`);
  }
}
