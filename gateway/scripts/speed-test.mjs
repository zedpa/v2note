#!/usr/bin/env node
/**
 * 快速模型速度对比 — 验证 enable_thinking 对延迟的影响
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const provider = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  name: "dashscope",
});

const PROMPT = [
  { role: "system", content: "你是一个简洁的助手，回复不超过2句话。" },
  { role: "user", content: "我总是在逃避" },
];

async function test(label, model, providerOptions) {
  const start = Date.now();
  try {
    const result = await generateText({
      model: provider.chat(model),
      messages: PROMPT,
      temperature: 0.7,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(120000),
      ...(providerOptions ? { providerOptions } : {}),
    });
    const ms = Date.now() - start;
    console.log(`${label.padEnd(40)} ${String(ms).padStart(6)}ms | ${String(result.text.length).padStart(3)}字 | ${result.text.replace(/\n/g, " ").slice(0, 80)}`);
  } catch (err) {
    console.log(`${label.padEnd(40)} ${String(Date.now() - start).padStart(6)}ms | ERROR: ${err.message.slice(0, 60)}`);
  }
}

console.log("模型速度对比测试\n");

// 顺序执行，避免并发干扰
await test("qwen3.5-plus (无参数)", "qwen3.5-plus", null);
await test("qwen3.5-plus (thinking=false)", "qwen3.5-plus", { openai: { enable_thinking: false } });
await test("qwen3.5-plus (thinking=true,budget=1024)", "qwen3.5-plus", { openai: { enable_thinking: true, thinking_budget: 1024 } });
await test("qwen3.6-plus (无参数)", "qwen3.6-plus", null);
await test("qwen3.6-plus (thinking=false)", "qwen3.6-plus", { openai: { enable_thinking: false } });
await test("qwen3.5-flash (无参数)", "qwen3.5-flash", null);

console.log("\n完成");
