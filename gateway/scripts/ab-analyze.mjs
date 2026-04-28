#!/usr/bin/env node

/**
 * A/B 实验离线分析工具
 *
 * 读取 gateway/logs/experiments.jsonl，按实验名 → 变体汇总指标。
 *
 * 用法：
 *   node gateway/scripts/ab-analyze.mjs                          # 分析全部数据
 *   node gateway/scripts/ab-analyze.mjs --experiment soul-variant # 只看指定实验
 *   node gateway/scripts/ab-analyze.mjs --days 7                  # 只看最近 7 天
 *   node gateway/scripts/ab-analyze.mjs --experiment soul-variant --days 7
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, "../logs/experiments.jsonl");

// ── 参数解析 ──────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { experiment: null, days: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--experiment" && args[i + 1]) {
      result.experiment = args[++i];
    } else if (args[i] === "--days" && args[i + 1]) {
      result.days = parseInt(args[++i], 10);
    }
  }

  return result;
}

// ── 数据读取 ──────────────────────────────────────────────────

function readLogs(filePath) {
  if (!existsSync(filePath)) {
    console.error(`日志文件不存在: ${filePath}`);
    console.error("请确保已运行过带实验的对话，或检查路径是否正确。");
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const entries = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // 跳过格式错误的行
    }
  }

  return entries;
}

// ── 过滤 ──────────────────────────────────────────────────────

function filterEntries(entries, { experiment, days }) {
  let filtered = entries;

  if (experiment) {
    filtered = filtered.filter(e => e.experiment === experiment);
  }

  if (days && days > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    filtered = filtered.filter(e => {
      try {
        return new Date(e.timestamp) >= cutoff;
      } catch {
        return false;
      }
    });
  }

  return filtered;
}

// ── 汇总分析 ──────────────────────────────────────────────────

function analyze(entries) {
  // 按 experiment → variant 分组
  const groups = new Map();

  for (const entry of entries) {
    const key = `${entry.experiment}::${entry.variant}`;
    if (!groups.has(key)) {
      groups.set(key, {
        experiment: entry.experiment,
        variant: entry.variant,
        count: 0,
        total_response_length: 0,
        total_latency_ms: 0,
        total_tool_calls: 0,
        models: new Map(),
        providers: new Map(),
      });
    }

    const g = groups.get(key);
    g.count++;
    g.total_response_length += entry.response_length ?? 0;
    g.total_latency_ms += entry.latency_ms ?? 0;
    g.total_tool_calls += entry.tool_calls_count ?? 0;

    // 追踪模型/provider 分布
    const model = entry.model ?? "unknown";
    g.models.set(model, (g.models.get(model) ?? 0) + 1);
    const provider = entry.provider ?? "unknown";
    g.providers.set(provider, (g.providers.get(provider) ?? 0) + 1);
  }

  return groups;
}

// ── 输出报告 ──────────────────────────────────────────────────

function printReport(groups, opts) {
  if (groups.size === 0) {
    console.log("没有找到匹配的实验数据。");
    if (opts.experiment) console.log(`  过滤条件: --experiment ${opts.experiment}`);
    if (opts.days) console.log(`  过滤条件: --days ${opts.days}`);
    return;
  }

  // 按 experiment 名称分组打印
  const byExperiment = new Map();
  for (const g of groups.values()) {
    if (!byExperiment.has(g.experiment)) {
      byExperiment.set(g.experiment, []);
    }
    byExperiment.get(g.experiment).push(g);
  }

  for (const [expName, variants] of byExperiment) {
    console.log("\n" + "═".repeat(60));
    console.log(`实验: ${expName}`);
    console.log("═".repeat(60));

    // 表头
    console.log(
      "变体".padEnd(20) +
      "样本数".padStart(8) +
      "平均字数".padStart(10) +
      "平均延迟(ms)".padStart(14) +
      "工具调用率".padStart(12)
    );
    console.log("─".repeat(64));

    for (const v of variants) {
      const avgLen = v.count > 0 ? Math.round(v.total_response_length / v.count) : 0;
      const avgLatency = v.count > 0 ? Math.round(v.total_latency_ms / v.count) : 0;
      const toolRate = v.count > 0 ? ((v.total_tool_calls / v.count) * 100).toFixed(1) + "%" : "0%";

      console.log(
        v.variant.padEnd(20) +
        String(v.count).padStart(8) +
        String(avgLen).padStart(10) +
        String(avgLatency).padStart(14) +
        toolRate.padStart(12)
      );
    }

    // 模型分布
    console.log("\n模型分布:");
    for (const v of variants) {
      const modelInfo = [...v.models.entries()]
        .map(([m, c]) => `${m}(${c})`)
        .join(", ");
      console.log(`  ${v.variant}: ${modelInfo}`);
    }

    // 结论
    if (variants.length >= 2) {
      console.log("\n结论:");
      const sorted = [...variants].sort((a, b) => {
        const avgA = a.count > 0 ? a.total_response_length / a.count : 0;
        const avgB = b.count > 0 ? b.total_response_length / b.count : 0;
        return avgA - avgB; // 更短的回复排前面（简洁优先）
      });
      const shortest = sorted[0];
      const longest = sorted[sorted.length - 1];
      const shortAvg = shortest.count > 0 ? Math.round(shortest.total_response_length / shortest.count) : 0;
      const longAvg = longest.count > 0 ? Math.round(longest.total_response_length / longest.count) : 0;

      if (shortAvg !== longAvg) {
        console.log(`  回复简洁度: "${shortest.variant}" 更简洁（${shortAvg} 字 vs ${longAvg} 字）`);
      }

      const fastSorted = [...variants].sort((a, b) => {
        const avgA = a.count > 0 ? a.total_latency_ms / a.count : 0;
        const avgB = b.count > 0 ? b.total_latency_ms / b.count : 0;
        return avgA - avgB;
      });
      const fastest = fastSorted[0];
      const slowest = fastSorted[fastSorted.length - 1];
      const fastAvg = fastest.count > 0 ? Math.round(fastest.total_latency_ms / fastest.count) : 0;
      const slowAvg = slowest.count > 0 ? Math.round(slowest.total_latency_ms / slowest.count) : 0;

      if (fastAvg !== slowAvg) {
        console.log(`  响应速度: "${fastest.variant}" 更快（${fastAvg}ms vs ${slowAvg}ms）`);
      }
    }
  }

  console.log("\n");
}

// ── Main ──────────────────────────────────────────────────────

const opts = parseArgs();
const entries = readLogs(LOG_FILE);
const filtered = filterEntries(entries, opts);

console.log(`\n共 ${entries.length} 条日志，过滤后 ${filtered.length} 条`);

const groups = analyze(filtered);
printReport(groups, opts);
