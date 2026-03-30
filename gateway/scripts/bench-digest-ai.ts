/**
 * Digest AI 基准测试：隔离测量 qwen-plus 调用延迟
 * 用法: cd gateway && npx tsx scripts/bench-digest-ai.ts
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import "dotenv/config";

const API_KEY = process.env.DASHSCOPE_API_KEY!;
const BASE_URL = process.env.AI_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODEL = process.env.AI_MODEL_FAST ?? "qwen-plus";

const provider = createOpenAI({ apiKey: API_KEY, baseURL: BASE_URL, name: "dashscope" });

// ── digest prompt（与生产环境一致）──────────────────────────────
const today = new Date().toISOString().split("T")[0];
const weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date().getDay()];

const SYSTEM_PROMPT = `你是一个认知分析引擎。将以下内容拆解为 Strike（认知触动）。每个 Strike 是一个能被独立理解的最小语义单元。

当前日期：${today}（周${weekday}）。所有相对时间（"明天""后天""下周一"等）以此为基准计算绝对日期。

每个 Strike 包含：
- nucleus: string — 完整命题。包含足够上下文（谁、什么、何时），保留不确定性（"可能"/"觉得"）和归属（谁说的）。一年后单独读到它要能理解。
- polarity: "perceive" | "judge" | "realize" | "intend" | "feel"
- confidence: 0-1，确信程度
- tags: string[] — 自由标签

**当 polarity = "intend" 时，额外提取以下字段到 field 对象中：**
- granularity: "action" | "goal" | "project"
- scheduled_start?: ISO 时间字符串
- deadline?: ISO 日期字符串
- person?: string
- priority?: "high" | "medium" | "low"

同时输出 Strike 之间的 bond（关系）：
- source_idx / target_idx: 索引（0-based）
- type: string
- strength: 0-1

返回纯 JSON：
{"strikes": [...], "bonds": [...]}`;

// ── 测试用例 ────────────────────────────────────────────────────
const TEST_CASES = [
  { label: "短文本(26字)", text: "你好，明天我要去学校，给我创建个代办" },
  { label: "中文本(80字)", text: "今天和张总开会讨论了供应链的问题，铝价又涨了5%，他说下个月可能还会继续涨。我觉得需要找备选供应商，明天下午三点先打个电话给李总问问报价。" },
  { label: "长文本(200字)", text: "早上到公司发现服务器又挂了，运维说是磁盘满了。我觉得这个问题根源在于日志没有做定期清理。提醒运维这周之内把日志轮转配好。下午和产品开会，新版本的需求基本确定了，主要是加一个数据导出功能和优化搜索性能。晚上回家路上想到一个点子，可以做一个AI助手来自动分析用户行为数据，找出流失风险高的用户。这个想法挺好的，先记下来，下周一和团队讨论一下可行性。" },
];

// ── cleanup prompt 对比 ─────────────────────────────────────────
const CLEANUP_PROMPT = `你是一个转写文本清理工具。对以下语音转写文本进行最小化清理：
- 移除口语填充词（嗯、啊、那个、就是说等）
- 修正错别字和语音识别错误
- 严格保留原文表述结构
- 不改写句式，不合并拆分句子
返回 JSON: {"summary": "清理后的文本"}`;

// ── 执行测试 ────────────────────────────────────────────────────
async function callAI(system: string, user: string, label: string): Promise<number> {
  const t0 = Date.now();
  const result = await generateText({
    model: provider.chat(MODEL),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(60_000),
  });
  const elapsed = Date.now() - t0;
  const tokens = result.usage;
  console.log(
    `  ${label.padEnd(20)} ${String(elapsed).padStart(6)}ms  ` +
    `prompt=${tokens.promptTokens} completion=${tokens.completionTokens}  ` +
    `resp=${result.text.length}字符`
  );
  return elapsed;
}

async function main() {
  console.log(`\n🔬 Digest AI 基准测试`);
  console.log(`   模型: ${MODEL}`);
  console.log(`   API:  ${BASE_URL}\n`);

  // 预热（首次调用包含连接建立开销）
  console.log("── 预热 ──");
  await callAI(CLEANUP_PROMPT, "测试", "warmup");

  // cleanup 对比
  console.log("\n── Cleanup AI（process 阶段）──");
  for (const tc of TEST_CASES) {
    await callAI(CLEANUP_PROMPT, tc.text, tc.label);
  }

  // digest 核心测试
  console.log("\n── Digest AI（核心瓶颈）──");
  const digestTimes: number[] = [];
  for (const tc of TEST_CASES) {
    const t = await callAI(SYSTEM_PROMPT, tc.text, tc.label);
    digestTimes.push(t);
  }

  // 同一输入重复 3 次，测稳定性
  console.log("\n── Digest AI 稳定性（短文本 x3）──");
  const repeatTimes: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = await callAI(SYSTEM_PROMPT, TEST_CASES[0].text, `run-${i + 1}`);
    repeatTimes.push(t);
  }

  // 汇总
  console.log("\n── 汇总 ──");
  console.log(`  Digest 短/中/长:  ${digestTimes.map(t => t + "ms").join(" / ")}`);
  console.log(`  Digest 稳定性:    ${repeatTimes.map(t => t + "ms").join(" / ")}  avg=${Math.round(repeatTimes.reduce((a, b) => a + b, 0) / repeatTimes.length)}ms`);
  console.log();
}

main().catch(console.error);
