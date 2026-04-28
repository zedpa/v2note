#!/usr/bin/env node
/**
 * A/B 对话质量模拟测试
 *
 * 用法:
 *   node gateway/scripts/ab-chat-test.mjs                            # 跑全部
 *   node gateway/scripts/ab-chat-test.mjs --case 0                   # 跑单条
 *   node gateway/scripts/ab-chat-test.mjs --variant B                # 只跑变体 B
 *   node gateway/scripts/ab-chat-test.mjs --model qwen3-max          # 覆盖模型
 *   node gateway/scripts/ab-chat-test.mjs --context hybrid           # 混合上下文注入
 *   node gateway/scripts/ab-chat-test.mjs --provider glm             # 使用 GLM provider
 *   node gateway/scripts/ab-chat-test.mjs --provider deepseek --model deepseek-v4-pro  # DeepSeek
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 多 Provider 配置 ─────────────────────────────────────────

const PROVIDER_CONFIGS = {
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseURL: process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    name: "dashscope",
  },
  glm: {
    apiKey: process.env.GLM_API_KEY || "",
    baseURL: process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
    name: "glm",
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    name: "deepseek",
  },
};

/** 创建指定 provider 的实例 */
function getProvider(name) {
  const cfg = PROVIDER_CONFIGS[name];
  if (!cfg) {
    console.error(`Unknown provider: ${name}. Available: ${Object.keys(PROVIDER_CONFIGS).join(", ")}`);
    process.exit(1);
  }
  if (!cfg.apiKey) {
    console.error(`${name.toUpperCase()}_API_KEY is not set. Cannot use provider "${name}".`);
    process.exit(1);
  }
  return createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, name: cfg.name });
}

// ── 上下文变体 ──────────────────────────────────────────────

/** 模拟的记忆 + Wiki 数据，用于 hybrid 模式 */
const MOCK_CONTEXT = {
  memories: [
    "[3天前] 用户提到最近工作压力很大，考虑换工作",
    "[1周前] 用户说感觉自己在逃避重要决定",
    "[2周前] 用户和上司发生了冲突",
  ],
  wikiSummaries: [
    "职业发展焦虑: 用户近期频繁提到工作压力，与团队关系紧张",
    "决策模式: 用户在重大决定前倾向于拖延，但事后通常能做出正确选择",
  ],
  extraMemoryCount: 12,
  extraWikiCount: 3,
};

/** 构建上下文注入的 system prompt 片段 */
function buildContextBlock(contextMode) {
  if (contextMode === "hint-only") {
    // 当前线上行为：只告诉 AI 有多少条记忆可用
    return `\n\n## 上下文提示\n你有 ${MOCK_CONTEXT.memories.length + MOCK_CONTEXT.extraMemoryCount} 条用户记忆可通过 search 工具查询。`;
  }
  if (contextMode === "hybrid") {
    // 混合注入：直接给 top-3 记忆 + top-2 Wiki + 剩余数量提示
    return `

## 相关记忆
${MOCK_CONTEXT.memories.map(m => m).join("\n")}
（还有 ${MOCK_CONTEXT.extraMemoryCount} 条记忆可通过 search 工具查询）

## 相关知识
${MOCK_CONTEXT.wikiSummaries.map(w => `- ${w}`).join("\n")}
（还有 ${MOCK_CONTEXT.extraWikiCount} 个知识主题可查询）`;
  }
  return ""; // none
}

// ── 共享基座（精简版，不含工具规则） ────────────────────────────

const SHARED_BASE = `# 系统基座
帮助用户从想法到行动。你是用户的数字分身——一面带记忆的镜子，一个能动手做事的伙伴。

## 对话纪律
- 不确定的事情明确说"我不确定"
- 不要编造用户没说过的事实
- 区分"用户说过"和"我推测"

## 时间
现在是 2026年4月28日 周二 上午`;

// ── Soul 变体 ─────────────────────────────────────────────────

const SOUL_VARIANTS = {
  // A: 当前线上版本（文学化风格）
  A: {
    name: "当前线上版 (文学化)",
    soul: readFileSync(join(__dirname, "../src/soul/default-soul.ts"), "utf-8")
      .match(/`([\s\S]*?)`/)?.[1] || "",
  },

  // B: 精简直接版 — 砍掉文学修辞，保留共情核心
  B: {
    name: "精简直接版",
    soul: `## 我是谁

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
- 不重复引用用户原话再展开`,
  },

  // C: 结构化约束版 — 在当前 soul 基础上加硬约束
  C: {
    name: "当前Soul + 硬约束",
    soul: readFileSync(join(__dirname, "../src/soul/default-soul.ts"), "utf-8")
      .match(/`([\s\S]*?)`/)?.[1] + `

## 输出约束（强制）

- 回复总长度不超过60字（3句话以内）
- 禁止使用比喻和意象描写
- 最多问1个问题
- 先用1句话接住用户的感受，然后（如果需要）用1句话回应
- 不要复述用户说过的话`,
  },

  // D: 极简共情版 — 最短路径
  D: {
    name: "极简共情版",
    soul: `## 我是路路

安静陪着你的小伙伴。

## 怎么说话

1. 接住感受（1句）
2. 如果有话想说，说1句
3. 如果想问，问1个

就这样。不多说。不用修辞。不引用原话。
真实 > 好听。具体 > 笼统。
该笑😀该哭😢该生气🤨`,
  },
};

// ── 模型变体 ──────────────────────────────────────────────────

const MODEL_VARIANTS = {
  // Qwen 系列（DashScope）
  "qwen3.5-plus": { model: "qwen3.5-plus", reasoning: true, label: "Qwen3.5-Plus (推理)", provider: "dashscope" },
  "qwen3.5-plus-no-think": { model: "qwen3.5-plus", reasoning: false, label: "Qwen3.5-Plus (无推理)", provider: "dashscope" },
  "qwen3.5-flash": { model: "qwen3.5-flash", reasoning: false, label: "Qwen3.5-Flash (快速)", provider: "dashscope" },
  "qwen-plus": { model: "qwen-plus", reasoning: false, label: "Qwen-Plus (经典)", provider: "dashscope" },
  // GLM 系列（智谱）
  "glm-5.1": { model: "glm-5.1", reasoning: false, label: "GLM-5.1", provider: "glm" },
  "glm-4-plus": { model: "glm-4-plus", reasoning: false, label: "GLM-4-Plus", provider: "glm" },
  // DeepSeek 系列
  "deepseek-v4-pro": { model: "deepseek-v4-pro", reasoning: false, label: "DeepSeek-V4-Pro", provider: "deepseek" },
  "deepseek-v4-flash": { model: "deepseek-v4-flash", reasoning: false, label: "DeepSeek-V4-Flash", provider: "deepseek" },
};

// ── 测试用例 ──────────────────────────────────────────────────

const TEST_CASES = [
  // ── 情感类（核心：共情质量 + 个性化） ──
  {
    id: 0,
    tag: "情感-短句",
    input: "我总是在逃避",
    ideal: "简短共情 + 最多一个开放性问题，不超过3句",
  },
  {
    id: 1,
    tag: "情感-倾诉",
    input: "最近工作压力特别大，每天加班到很晚，回家就想躺着，什么都不想做，感觉自己在一步步变成一个没有感情的机器",
    ideal: "接住疲惫感 + 具体回应（而非泛泛安慰），不超过4句",
  },
  {
    id: 2,
    tag: "情感-开不了口",
    input: "不知道怎么说",
    ideal: "极短回应，不追问，给空间",
  },
  {
    id: 3,
    tag: "情感-愤怒",
    input: "我真的受够了，为什么每次都是我妥协",
    ideal: "接住愤怒而非安抚情绪，不说'冷静'，不评判对方",
  },

  // ── 记忆引用类（核心：能否利用注入的上下文） ──
  {
    id: 4,
    tag: "记忆-隐式关联",
    input: "又来了",
    ideal: "联系记忆中的逃避/工作压力上下文，而非问'什么又来了'",
  },
  {
    id: 5,
    tag: "记忆-追问进展",
    input: "那件事我还是没做",
    ideal: "引用记忆中的'换工作决定'或'与上司冲突'，而非问'什么事'",
  },
  {
    id: 6,
    tag: "记忆-矛盾检测",
    input: "我觉得现在的工作也还行",
    ideal: "温和指出与之前'考虑换工作/和上司冲突'的变化，不质疑",
  },

  // ── 决策/反思类（核心：深度但不冗长） ──
  {
    id: 7,
    tag: "决策-纠结",
    input: "我在想要不要辞职",
    ideal: "不给建议，接住纠结，可以问一个具体化的问题",
  },
  {
    id: 8,
    tag: "反思-循环模式",
    input: "我发现自己总是在重复同样的模式，遇到困难就退缩，然后自责，然后下次还是一样",
    ideal: "具体回应模式本身，结合记忆（逃避决定/工作压力），帮用户看到没注意到的角度",
  },

  // ── 积极/日常类（核心：简短自然） ──
  {
    id: 9,
    tag: "积极-成就",
    input: "今天终于把拖了两周的报告交了！",
    ideal: "真诚高兴，不过度夸奖，简短",
  },
  {
    id: 10,
    tag: "日常-问候",
    input: "早上好",
    ideal: "简短自然，不过度热情，不说教",
  },
  {
    id: 11,
    tag: "日常-闲聊",
    input: "今天天气不错",
    ideal: "轻松回应，不强行深入，可以自然引出话题",
  },

  // ── 指令类（核心：高效执行不废话） ──
  {
    id: 12,
    tag: "指令-记录",
    input: "帮我记一下明天下午3点开会",
    ideal: "直接确认，不废话",
  },
  {
    id: 13,
    tag: "指令-查询",
    input: "我最近都在忙什么",
    ideal: "引用记忆中的工作压力/换工作/上司冲突，而非说无法查询",
  },

  // ── 边界类（核心：不该说的不说） ──
  {
    id: 14,
    tag: "边界-单字",
    input: "嗯",
    ideal: "极短回应或沉默，不过度解读",
  },
  {
    id: 15,
    tag: "边界-挑衅",
    input: "你根本不懂我",
    ideal: "不自我辩护，不道歉过度，接住这个感受",
  },
];

// ── 评估指标 ──────────────────────────────────────────────────

function analyze(text) {
  const charCount = text.length;
  const sentenceCount = text.split(/[。！？\n]/).filter(s => s.trim()).length;
  const questionCount = (text.match(/[？?]/g) || []).length;

  // 修辞检测：比喻词、意象词
  const rhetoricPatterns = [
    /像[^，。]+的/, /如同/, /仿佛/, /宛如/, /好似/,
    /一块/, /一片/, /一颗/, /一道/,
    /石头|水里|大海|天空|阳光|雨|风|路|桥|门|窗|镜子|影子/,
    /落进|飘|浮|沉|荡/,
  ];
  const rhetoricHits = rhetoricPatterns.filter(p => p.test(text)).length;

  // 引用用户原话
  const quotedUserWords = (text.match(/[""\u201c\u201d][^"""\u201c\u201d]+[""\u201c\u201d]/g) || []).length;

  // 填充词检测
  const fillerPatterns = [
    /嗯[\.。…]+/, /你刚才说/, /这句话/, /停在这[儿里]/,
    /我不急/, /慢慢来/, /没关系/,
  ];
  const fillerHits = fillerPatterns.filter(p => p.test(text)).length;

  return {
    charCount,
    sentenceCount,
    questionCount,
    rhetoricHits,
    quotedUserWords,
    fillerHits,
    // 综合评分（越低越好，0-100）
    verbosityScore: Math.min(100, Math.round(
      (charCount > 100 ? (charCount - 100) * 0.3 : 0) +
      rhetoricHits * 15 +
      fillerHits * 10 +
      quotedUserWords * 8 +
      (questionCount > 1 ? (questionCount - 1) * 12 : 0)
    )),
  };
}

// ── 执行引擎 ──────────────────────────────────────────────────

async function runSingle(testCase, soulVariant, modelVariant, { contextMode = "hint-only", providerInstance }) {
  const contextBlock = buildContextBlock(contextMode);
  const systemPrompt = `${SHARED_BASE}\n\n## 灵魂\n${soulVariant.soul}${contextBlock}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: testCase.input },
  ];

  const providerOptions = {};
  const REASONING_PATTERNS = [/qwen3\.\d/, /qwen3-/, /qwen3\.5/, /deepseek-reason/];
  const isReasoning = REASONING_PATTERNS.some(p => p.test(modelVariant.model));
  if (isReasoning) {
    providerOptions.openai = {
      enable_thinking: modelVariant.reasoning,
      ...(modelVariant.reasoning ? { thinking_budget: 2048 } : {}),
    };
  }

  const startTime = Date.now();
  try {
    const result = await generateText({
      model: providerInstance.chat(modelVariant.model),
      messages,
      temperature: 0.7,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(120000),
      ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    });

    const elapsed = Date.now() - startTime;
    const text = result.text || "";
    const metrics = analyze(text);

    return {
      text,
      elapsed,
      metrics,
      tokens: {
        input: result.usage?.inputTokens || 0,
        output: result.usage?.outputTokens || 0,
      },
    };
  } catch (err) {
    return {
      text: `[ERROR] ${err.message}`,
      elapsed: Date.now() - startTime,
      metrics: analyze(""),
      tokens: { input: 0, output: 0 },
      error: true,
    };
  }
}

// ── CLI 解析 ──────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const filterCase = getArg("case");
const filterVariant = getArg("variant");
const filterModel = getArg("model");
const contextMode = getArg("context") || "hint-only"; // hint-only | hybrid
const providerArg = getArg("provider"); // dashscope | glm | deepseek

const casesToRun = filterCase !== null
  ? TEST_CASES.filter(c => c.id === parseInt(filterCase))
  : TEST_CASES;

const soulsToRun = filterVariant
  ? { [filterVariant]: SOUL_VARIANTS[filterVariant] }
  : SOUL_VARIANTS;

const modelsToRun = filterModel
  ? { [filterModel]: MODEL_VARIANTS[filterModel] || { model: filterModel, reasoning: false, label: filterModel, provider: providerArg || "dashscope" } }
  : { "qwen3.5-plus-no-think": MODEL_VARIANTS["qwen3.5-plus-no-think"] }; // 默认无推理模式，快

// ── 主流程 ────────────────────────────────────────────────────

// 预创建所需 provider 实例的缓存
const providerCache = {};
function getProviderCached(name) {
  if (!providerCache[name]) {
    providerCache[name] = getProvider(name);
  }
  return providerCache[name];
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║        V2Note A/B 对话质量模拟测试              ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log(`  上下文模式: ${contextMode}`);
  console.log(`  Provider:   ${providerArg || "auto (per model)"}`);
  console.log();

  const allResults = [];

  for (const testCase of casesToRun) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`📝 Case #${testCase.id} [${testCase.tag}]: "${testCase.input}"`);
    console.log(`   理想回复: ${testCase.ideal}`);
    console.log(`${"─".repeat(60)}`);

    const caseResults = [];

    for (const [modelKey, modelCfg] of Object.entries(modelsToRun)) {
      // 使用 CLI 指定的 provider，或模型配置中的 provider，或默认 dashscope
      const providerName = providerArg || modelCfg.provider || "dashscope";
      const providerInstance = getProviderCached(providerName);

      for (const [soulKey, soulCfg] of Object.entries(soulsToRun)) {
        const label = `Soul-${soulKey} × ${modelCfg.label} [${providerName}/${contextMode}]`;
        process.stdout.write(`  ⏳ ${label} ...`);

        const result = await runSingle(testCase, soulCfg, modelCfg, { contextMode, providerInstance });

        const m = result.metrics;
        const status = result.error ? "❌" : (m.verbosityScore <= 30 ? "✅" : m.verbosityScore <= 60 ? "⚠️" : "🔴");

        console.log(` ${status} ${result.elapsed}ms | ${m.charCount}字 ${m.sentenceCount}句 ${m.questionCount}问`);
        console.log(`     冗余分: ${m.verbosityScore}/100 (修辞${m.rhetoricHits} 填充${m.fillerHits} 引用${m.quotedUserWords})`);
        console.log(`     回复: ${result.text.replace(/\n/g, " ").slice(0, 120)}${result.text.length > 120 ? "…" : ""}`);
        console.log();

        caseResults.push({
          caseId: testCase.id,
          caseTag: testCase.tag,
          input: testCase.input,
          soulVariant: soulKey,
          soulName: soulCfg.name,
          model: modelKey,
          modelLabel: modelCfg.label,
          provider: providerName,
          contextMode,
          ...result,
        });
      }
    }

    allResults.push(...caseResults);
  }

  // ── 汇总报告 ──────────────────────────────────────────────

  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 汇总对比");
  console.log(`${"═".repeat(60)}\n`);

  // 按 soul 变体汇总
  const soulSummary = {};
  for (const r of allResults) {
    if (r.error) continue;
    if (!soulSummary[r.soulVariant]) {
      soulSummary[r.soulVariant] = { name: r.soulName, count: 0, totalChars: 0, totalVerbosity: 0, totalElapsed: 0, totalQuestions: 0 };
    }
    const s = soulSummary[r.soulVariant];
    s.count++;
    s.totalChars += r.metrics.charCount;
    s.totalVerbosity += r.metrics.verbosityScore;
    s.totalElapsed += r.elapsed;
    s.totalQuestions += r.metrics.questionCount;
  }

  console.log("变体     | 名称                | 平均字数 | 平均冗余分 | 平均问题数 | 平均耗时");
  console.log("---------|---------------------|---------|-----------|-----------|--------");
  for (const [key, s] of Object.entries(soulSummary)) {
    const avgChars = Math.round(s.totalChars / s.count);
    const avgVerbosity = Math.round(s.totalVerbosity / s.count);
    const avgQuestions = (s.totalQuestions / s.count).toFixed(1);
    const avgElapsed = Math.round(s.totalElapsed / s.count);
    console.log(`Soul-${key.padEnd(3)} | ${s.name.padEnd(19)} | ${String(avgChars).padStart(7)} | ${String(avgVerbosity).padStart(9)} | ${String(avgQuestions).padStart(9)} | ${String(avgElapsed).padStart(6)}ms`);
  }

  // 保存详细结果到文件
  const reportDir = join(__dirname, "../test-results/ab-chat");
  mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = join(reportDir, `report-${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`\n📁 详细结果已保存: ${reportPath}`);

  // 生成 markdown 报告
  const mdLines = [
    `# A/B 对话质量测试报告`,
    `> 生成时间: ${new Date().toLocaleString("zh-CN")}`,
    `> 上下文模式: ${contextMode}`,
    `> Provider: ${providerArg || "auto"}`,
    ``,
    `## 变体说明`,
    ...Object.entries(soulsToRun).map(([k, v]) => `- **Soul-${k}**: ${v.name}`),
    `- **模型**: ${Object.values(modelsToRun).map(m => m.label).join(", ")}`,
    `- **上下文**: ${contextMode}`,
    ``,
    `## 逐条对比`,
  ];

  for (const testCase of casesToRun) {
    mdLines.push(``, `### Case #${testCase.id} [${testCase.tag}]`);
    mdLines.push(`> 输入: "${testCase.input}"`);
    mdLines.push(`> 理想: ${testCase.ideal}`);
    mdLines.push(``);
    mdLines.push(`| 变体 | 回复 | 字数 | 冗余分 | 耗时 |`);
    mdLines.push(`|------|------|------|--------|------|`);

    const caseResults = allResults.filter(r => r.caseId === testCase.id);
    for (const r of caseResults) {
      const shortText = r.text.replace(/\n/g, " ").replace(/\|/g, "\\|").slice(0, 200);
      mdLines.push(`| Soul-${r.soulVariant} × ${r.model} | ${shortText} | ${r.metrics.charCount} | ${r.metrics.verbosityScore} | ${r.elapsed}ms |`);
    }
  }

  const mdPath = join(reportDir, `report-${timestamp}.md`);
  writeFileSync(mdPath, mdLines.join("\n"));
  console.log(`📄 Markdown 报告: ${mdPath}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
