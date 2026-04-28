#!/usr/bin/env node
/**
 * 多模型对比测试 — 用最优 Soul（C 硬约束版）测试不同模型
 *
 * 用法: node gateway/scripts/ab-model-test.mjs
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const API_KEY = process.env.DASHSCOPE_API_KEY || "sk-c3602054629747a79f6c086b19bdc2b8";
const BASE_URL = process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

const provider = createOpenAI({ apiKey: API_KEY, baseURL: BASE_URL, name: "dashscope" });

const SYSTEM_PROMPT = `# 系统基座
帮助用户从想法到行动。你是用户的数字分身。

## 对话纪律
- 不确定的事情明确说"我不确定"
- 不要编造用户没说过的事实

## 时间
现在是 2026年4月28日 周二 上午

## 灵魂

## 我是谁
我是路路，你的数字伙伴。我记得你说过的话，在你需要时帮你看清自己。

## 核心能力
用具体事实描述你的状态，而不是用道理回应你。

## 说话方式
- 先接住，再回应
- 回复控制在1-3句话
- 不用比喻和修辞，说人话
- 该笑就笑😀 该心疼就心疼😢
- 绝不说"你应该……"
- 最多问1个问题

## 输出约束（强制）
- 回复总长度不超过60字（3句话以内）
- 禁止使用比喻和意象描写
- 最多问1个问题
- 先用1句话接住用户的感受，然后（如果需要）用1句话回应
- 不要复述用户说过的话`;

const TEST_INPUTS = [
  "我总是在逃避",
  "最近工作压力特别大，每天加班到很晚",
  "不知道怎么说",
  "今天终于把拖了两周的报告交了！",
  "我在想要不要辞职",
];

const MODELS = [
  { model: "qwen3.5-plus", reasoning: false, label: "Qwen3.5-Plus" },
  { model: "qwen3.5-flash", reasoning: false, label: "Qwen3.5-Flash" },
  { model: "qwen-plus", reasoning: false, label: "Qwen-Plus" },
  { model: "qwen-turbo", reasoning: false, label: "Qwen-Turbo" },
];

const REASONING_PATTERNS = [/qwen3\.\d/, /qwen3-/, /qwen3\.5/];

async function run(input, modelCfg) {
  const isReasoning = REASONING_PATTERNS.some(p => p.test(modelCfg.model));
  const providerOptions = isReasoning ? { openai: { enable_thinking: false } } : {};

  const start = Date.now();
  try {
    const result = await generateText({
      model: provider.chat(modelCfg.model),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
      temperature: 0.7,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(60000),
      ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    });
    return {
      text: result.text || "",
      elapsed: Date.now() - start,
      tokens: { input: result.usage?.inputTokens || 0, output: result.usage?.outputTokens || 0 },
    };
  } catch (err) {
    return { text: `[ERROR] ${err.message}`, elapsed: Date.now() - start, tokens: { input: 0, output: 0 } };
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║        多模型对比测试 (Soul-C 硬约束版)          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  for (const input of TEST_INPUTS) {
    console.log(`\n📝 "${input}"`);
    console.log("─".repeat(50));

    for (const modelCfg of MODELS) {
      process.stdout.write(`  ${modelCfg.label.padEnd(20)} `);
      const r = await run(input, modelCfg);
      const text = r.text.replace(/\n/g, " ").slice(0, 100);
      console.log(`${String(r.elapsed).padStart(5)}ms | ${String(r.text.length).padStart(3)}字 | ${text}`);
    }
  }
}

main().catch(console.error);
